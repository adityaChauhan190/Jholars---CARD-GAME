/**
 * 29 Sum Card Game — Server (Fair Edition)
 * 
 * STAKE-BASED BETTING:
 *   stake = what a blind player pays (starts at boot amount, e.g. 10)
 *   Blind player pays: 1× stake
 *   Seen player pays:  2× stake
 *   
 *   When blind raises to X → new stake = X
 *   When seen raises to X → new stake = X / 2
 *   
 *   Show costs: 2× stake (seen rate), only with 2 players left
 * 
 * FAIRNESS:
 *   - Cryptographic shuffle (crypto.randomInt) for cards
 *   - Random hand assignment (shuffled deal)
 *   - Random turn order each round (shuffled activePlayers)
 *   - Random starting player each round
 *   - Random tie-breaking for identical hands
 * 
 * FEATURES:
 *   - Host-controlled next round (no auto-timer)
 *   - Per-player statistics tracking
 *   - Add coins support
 *   - Game-end leaderboard summary
 */

const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { createRoom, joinRoom, leaveRoom, getRoom, getRoomByPlayerId, resetRoom, getCurrentTurnPlayer, advanceTurn, updatePlayerStats, addCoins, getGameSummary, deleteRoom } = require('./game/room');
const { deal, shuffle } = require('./game/deck');
const { calculateScore, rankPlayers } = require('./game/scoring');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

function broadcastGameState(room) {
  const turnPlayer = getCurrentTurnPlayer(room);

  room.players.forEach(p => {
    const blindCost = room.stake;
    const seenCost = room.stake * 2;
    const myCost = p.isSeen ? seenCost : blindCost;

    io.to(p.id).emit('game-state', {
      pot: room.pot,
      stake: room.stake,
      blindCost,
      seenCost,
      myCost,
      currentTurnId: turnPlayer ? turnPlayer.id : null,
      currentTurnName: turnPlayer ? turnPlayer.name : null,
      players: room.players.map(pl => ({
        id: pl.id, name: pl.name, chips: pl.chips,
        isSeen: pl.isSeen, isFolded: pl.isFolded,
        totalBet: pl.totalBet,
        isActive: room.activePlayers.includes(pl.id),
        stats: pl.stats
      })),
      myHand: p.isSeen ? p.hand : null,
      isSeen: p.isSeen,
      isFolded: p.isFolded,
      isMyTurn: turnPlayer && turnPlayer.id === p.id && !p.isFolded,
      activePlayers: room.activePlayers.length,
      state: room.state,
      roundNumber: room.roundNumber,
      hostId: room.hostId
    });
  });
}

/**
 * Emit results (no auto-timer — host controls next round).
 */
function emitResults(room, code, results) {
  // Include hostId so clients can show host controls
  results.hostId = room.hostId;
  io.to(code).emit('results', results);
}

/**
 * Start a new round (called by host via start-next-round event).
 */
function startNextRound(room, code) {
  // Reset room state
  room.state = 'waiting';
  room.pot = 0;
  room.currentBet = room.bootAmount;
  room.currentTurnIndex = 0;
  room.activePlayers = [];

  room.players.forEach(p => {
    p.hand = null;
    p.score = null;
    p.rank = null;
    p.isSeen = false;
    p.isFolded = false;
    p.totalBet = 0;
  });

  room.roundNumber++;

  // Check all players have enough chips for boot
  const canPlay = room.players.filter(p => p.chips >= room.bootAmount);
  if (canPlay.length < 2) {
    io.to(code).emit('round-start-failed', { reason: 'Not enough players with sufficient coins' });
    io.to(code).emit('room-reset', { players: sanitizePlayers(room.players), hostId: room.hostId });
    return false;
  }

  // Deal & start
  const hands = deal(room.players.length);
  room.state = 'playing';
  room.pot = 0;
  room.stake = room.bootAmount;
  room.activePlayers = [];

  room.players.forEach((p, i) => {
    p.hand = hands[i]; p.score = calculateScore(hands[i]);
    p.isSeen = false; p.isFolded = false;
    p.totalBet = room.bootAmount;
    p.chips -= room.bootAmount;
    room.pot += room.bootAmount;
    room.activePlayers.push(p.id);
  });

  // Shuffle turn order so no player benefits from join position
  room.activePlayers = shuffle(room.activePlayers);
  // Random starting player
  room.currentTurnIndex = crypto.randomInt(0, room.activePlayers.length);

  io.to(code).emit('next-round-started', { roundNumber: room.roundNumber });
  broadcastGameState(room);
  return true;
}

function checkAutoWin(room) {
  if (room.activePlayers.length === 1) {
    const winner = room.players.find(p => p.id === room.activePlayers[0]);
    if (winner) {
      winner.chips += room.pot;
      room.state = 'results';

      // Update stats
      updatePlayerStats(room, winner.id);

      const results = {
        results: room.players.map(p => ({
          id: p.id, name: p.name, hand: p.hand,
          score: p.score || calculateScore(p.hand),
          isFolded: p.isFolded, chips: p.chips, totalBet: p.totalBet,
          stats: p.stats
        })),
        winnerId: winner.id, winnerName: winner.name,
        pot: room.pot, winType: 'fold',
        roundNumber: room.roundNumber
      };

      emitResults(room, room.code, results);
    }
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  console.log(`✦ Connected: ${socket.id}`);

  socket.on('create-room', ({ playerName, bootAmount }, cb) => {
    try {
      const boot = Math.max(10, Math.min(100, parseInt(bootAmount) || 10));
      const room = createRoom(socket.id, playerName, boot);
      socket.join(room.code);
      cb({ success: true, room: sanitize(room), playerId: socket.id });
    } catch (e) { cb({ success: false, error: e.message }); }
  });

  socket.on('join-room', ({ code, playerName }, cb) => {
    try {
      const room = joinRoom(code, socket.id, playerName);
      socket.join(code);
      cb({ success: true, room: sanitize(room), playerId: socket.id });
      socket.to(code).emit('player-joined', { players: sanitizePlayers(room.players), newPlayer: playerName });
    } catch (e) { cb({ success: false, error: e.message }); }
  });

  socket.on('start-game', (code, cb) => {
    const room = getRoom(code);
    if (!room) return cb({ success: false, error: 'Room not found' });
    if (room.hostId !== socket.id) return cb({ success: false, error: 'Only host can start' });
    if (room.players.length < 2) return cb({ success: false, error: 'Need at least 2 players' });

    const hands = deal(room.players.length);
    room.state = 'playing';
    room.pot = 0;
    room.stake = room.bootAmount;
    room.currentTurnIndex = 0;
    room.activePlayers = [];

    room.players.forEach((p, i) => {
      p.hand = hands[i]; p.score = calculateScore(hands[i]);
      p.isSeen = false; p.isFolded = false;
      p.totalBet = room.bootAmount;
      p.chips -= room.bootAmount;
      room.pot += room.bootAmount;
      room.activePlayers.push(p.id);
    });

    // Shuffle turn order so no player benefits from join position
    room.activePlayers = shuffle(room.activePlayers);
    // Random starting player
    room.currentTurnIndex = crypto.randomInt(0, room.activePlayers.length);
    cb({ success: true });
    broadcastGameState(room);
  });

  socket.on('see-cards', (code, cb) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return cb({ success: false, error: 'No game' });
    const p = room.players.find(x => x.id === socket.id);
    if (!p || p.isFolded) return cb({ success: false, error: 'Not in game' });
    if (p.isSeen) return cb({ success: false, error: 'Already seen' });
    p.isSeen = true;
    cb({ success: true, hand: p.hand });
    broadcastGameState(room);
  });

  // CALL — pay the minimum for your status
  socket.on('call', (code, cb) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return cb({ success: false, error: 'No game' });
    const tp = getCurrentTurnPlayer(room);
    if (!tp || tp.id !== socket.id) return cb({ success: false, error: 'Not your turn' });

    const amt = tp.isSeen ? room.stake * 2 : room.stake;
    if (tp.chips < amt) return cb({ success: false, error: 'Not enough chips' });

    tp.chips -= amt; tp.totalBet += amt; room.pot += amt;
    advanceTurn(room);
    cb({ success: true, amount: amt });
    broadcastGameState(room);
  });

  // RAISE — choose amount to pay (must be >= minimum, multiples of 10)
  socket.on('raise', ({ code, amount }, cb) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return cb({ success: false, error: 'No game' });
    const tp = getCurrentTurnPlayer(room);
    if (!tp || tp.id !== socket.id) return cb({ success: false, error: 'Not your turn' });

    const amt = parseInt(amount) || 0;
    const minAmt = tp.isSeen ? room.stake * 2 : room.stake;

    if (amt <= minAmt) return cb({ success: false, error: `Must raise above ${minAmt}` });
    if (amt % 10 !== 0) return cb({ success: false, error: 'Must be multiples of 10' });
    if (tp.chips < amt) return cb({ success: false, error: 'Not enough chips' });

    tp.chips -= amt; tp.totalBet += amt; room.pot += amt;

    // Update stake: blind's amount = new stake; seen's amount / 2 = new stake
    room.stake = tp.isSeen ? amt / 2 : amt;

    advanceTurn(room);
    cb({ success: true, amount: amt, newStake: room.stake });
    broadcastGameState(room);
  });

  socket.on('fold', (code, cb) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return cb({ success: false, error: 'No game' });
    const tp = getCurrentTurnPlayer(room);
    if (!tp || tp.id !== socket.id) return cb({ success: false, error: 'Not your turn' });

    tp.isFolded = true;
    room.activePlayers = room.activePlayers.filter(id => id !== socket.id);
    if (room.currentTurnIndex >= room.activePlayers.length) room.currentTurnIndex = 0;

    cb({ success: true });
    if (!checkAutoWin(room)) broadcastGameState(room);
  });

  // SHOW — only with 2 remaining, must be seen, pays 2× stake
  socket.on('show', (code, cb) => {
    const room = getRoom(code);
    if (!room || room.state !== 'playing') return cb({ success: false, error: 'No game' });
    const tp = getCurrentTurnPlayer(room);
    if (!tp || tp.id !== socket.id) return cb({ success: false, error: 'Not your turn' });
    if (room.activePlayers.length !== 2) return cb({ success: false, error: 'Need exactly 2 players' });

    // Blind pays 1× stake, seen pays 2× stake for show
    const cost = tp.isSeen ? room.stake * 2 : room.stake;
    if (tp.chips < cost) return cb({ success: false, error: 'Not enough chips' });

    tp.chips -= cost; tp.totalBet += cost; room.pot += cost;
    room.state = 'results';

    const active = room.players.filter(p => room.activePlayers.includes(p.id));
    active.forEach(p => { if (!p.score) p.score = calculateScore(p.hand); });
    const ranked = rankPlayers(active);
    ranked[0].chips += room.pot;
    ranked.forEach((rp, i) => {
      const p = room.players.find(x => x.id === rp.id);
      if (p) p.rank = rp.rank;
    });

    // Update stats
    updatePlayerStats(room, ranked[0].id);

    const results = {
      results: room.players.map(p => ({
        id: p.id, name: p.name, hand: p.hand,
        score: p.score || calculateScore(p.hand),
        rank: p.rank, isFolded: p.isFolded, chips: p.chips, totalBet: p.totalBet,
        stats: p.stats
      })),
      winnerId: ranked[0].id, winnerName: ranked[0].name,
      pot: room.pot, winType: 'showdown',
      roundNumber: room.roundNumber
    };

    emitResults(room, code, results);
    cb({ success: true });
  });

  socket.on('play-again', (code, cb) => {
    const room = resetRoom(code);
    if (!room) return cb({ success: false, error: 'Room not found' });
    io.to(code).emit('room-reset', { players: sanitizePlayers(room.players), hostId: room.hostId });
    cb({ success: true });
  });

  // START NEXT ROUND — host only
  socket.on('start-next-round', (code, cb) => {
    const room = getRoom(code);
    if (!room) return cb({ success: false, error: 'Room not found' });
    if (room.hostId !== socket.id) return cb({ success: false, error: 'Only the host can start the next round' });
    if (room.players.length < 2) return cb({ success: false, error: 'Need at least 2 players' });

    const started = startNextRound(room, code);
    cb({ success: started, error: started ? undefined : 'Could not start round' });
  });

  // ADD COINS
  socket.on('add-coins', ({ code, amount }, cb) => {
    try {
      const player = addCoins(code, socket.id, parseInt(amount));
      cb({ success: true, chips: player.chips });
      // Broadcast updated player info
      const room = getRoom(code);
      if (room) {
        io.to(code).emit('coins-added', {
          playerId: socket.id,
          playerName: player.name,
          amount: parseInt(amount),
          newBalance: player.chips
        });
        // If in game, broadcast updated state
        if (room.state === 'playing') {
          broadcastGameState(room);
        } else {
          io.to(code).emit('player-joined', { players: sanitizePlayers(room.players), newPlayer: '' });
        }
      }
    } catch (e) { cb({ success: false, error: e.message }); }
  });

  // END GAME — show final leaderboard
  socket.on('end-game', (code, cb) => {
    const room = getRoom(code);
    if (!room) return cb({ success: false, error: 'Room not found' });

    const summary = getGameSummary(room);
    io.to(code).emit('game-ended', { summary, roomCode: code });
    cb({ success: true });

    // Clean up room after a short delay so clients receive the event
    setTimeout(() => deleteRoom(code), 2000);
  });

  socket.on('chat-message', ({ code, message }) => {
    const room = getRoom(code);
    if (!room) return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p) return;
    io.to(code).emit('chat-message', { name: p.name, message, timestamp: Date.now() });
  });

  socket.on('kick-player', ({ code, playerId }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostId !== socket.id) return cb({ success: false, error: 'Cannot kick' });
    const kicked = room.players.find(p => p.id === playerId);
    if (!kicked) return cb({ success: false, error: 'Not found' });
    leaveRoom(code, playerId);
    io.to(playerId).emit('kicked');
    const s = io.sockets.sockets.get(playerId);
    if (s) s.leave(code);
    io.to(code).emit('player-left', { players: sanitizePlayers(room.players), hostId: room.hostId, leftPlayer: kicked.name });
    cb({ success: true });
  });

  socket.on('leave-room', (code) => handleLeave(socket, code));
  socket.on('disconnect', () => {
    const room = getRoomByPlayerId(socket.id);
    if (room) {
      handleLeave(socket, room.code);
      if (room.state === 'playing' && !checkAutoWin(room)) broadcastGameState(room);
    }
  });
});

function handleLeave(socket, code) {
  const room = getRoom(code);
  if (!room) return;
  const p = room.players.find(x => x.id === socket.id);
  const updated = leaveRoom(code, socket.id);
  socket.leave(code);
  if (updated) io.to(code).emit('player-left', { players: sanitizePlayers(updated.players), hostId: updated.hostId, leftPlayer: p ? p.name : '?' });
}

function sanitize(room) {
  return { code: room.code, hostId: room.hostId, state: room.state, bootAmount: room.bootAmount, players: sanitizePlayers(room.players) };
}
function sanitizePlayers(players) {
  return players.map(p => ({ id: p.id, name: p.name, chips: p.chips, stats: p.stats }));
}

server.listen(PORT, () => {
  console.log(`\n  ♠ ♥ ♦ ♣  29 Sum Card Game  ♣ ♦ ♥ ♠`);
  console.log(`  Server running on http://localhost:${PORT}\n`);
});
