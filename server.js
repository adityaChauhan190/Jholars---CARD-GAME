/**
 * 29 Sum Card Game — Server
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
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { createRoom, joinRoom, leaveRoom, getRoom, getRoomByPlayerId, resetRoom, getCurrentTurnPlayer, advanceTurn } = require('./game/room');
const { deal } = require('./game/deck');
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
        isActive: room.activePlayers.includes(pl.id)
      })),
      myHand: p.isSeen ? p.hand : null,
      isSeen: p.isSeen,
      isFolded: p.isFolded,
      isMyTurn: turnPlayer && turnPlayer.id === p.id && !p.isFolded,
      activePlayers: room.activePlayers.length,
      state: room.state
    });
  });
}

function checkAutoWin(room) {
  if (room.activePlayers.length === 1) {
    const winner = room.players.find(p => p.id === room.activePlayers[0]);
    if (winner) {
      winner.chips += room.pot;
      room.state = 'results';
      io.to(room.code).emit('results', {
        results: room.players.map(p => ({
          id: p.id, name: p.name, hand: p.hand,
          score: p.score || calculateScore(p.hand),
          isFolded: p.isFolded, chips: p.chips, totalBet: p.totalBet
        })),
        winnerId: winner.id, winnerName: winner.name,
        pot: room.pot, winType: 'fold'
      });
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

    room.currentTurnIndex = room.activePlayers.length > 1 ? 1 : 0;
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

    io.to(code).emit('results', {
      results: room.players.map(p => ({
        id: p.id, name: p.name, hand: p.hand,
        score: p.score || calculateScore(p.hand),
        rank: p.rank, isFolded: p.isFolded, chips: p.chips, totalBet: p.totalBet
      })),
      winnerId: ranked[0].id, winnerName: ranked[0].name,
      pot: room.pot, winType: 'showdown'
    });
    cb({ success: true });
  });

  socket.on('play-again', (code, cb) => {
    const room = resetRoom(code);
    if (!room) return cb({ success: false, error: 'Room not found' });
    io.to(code).emit('room-reset', { players: sanitizePlayers(room.players), hostId: room.hostId });
    cb({ success: true });
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
  return players.map(p => ({ id: p.id, name: p.name, chips: p.chips }));
}

server.listen(PORT, () => {
  console.log(`\n  ♠ ♥ ♦ ♣  29 Sum Card Game  ♣ ♦ ♥ ♠`);
  console.log(`  Server running on http://localhost:${PORT}\n`);
});
