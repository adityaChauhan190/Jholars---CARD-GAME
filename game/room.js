/**
 * Room Management Module — Betting Version
 * 
 * Handles rooms, players, betting state, and turn management.
 */

const rooms = new Map();

const DEFAULT_BUY_IN = 1000;
const MIN_BET = 10;

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

function createRoom(hostId, hostName, bootAmount = MIN_BET) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId,
    state: 'waiting', // waiting | playing | showdown | results
    bootAmount: bootAmount,
    pot: 0,
    currentBet: bootAmount,
    currentTurnIndex: 0,
    players: [
      createPlayer(hostId, hostName)
    ],
    activePlayers: [], // ids of players still in the round
    chat: [],
    roundNumber: 0
  };
  rooms.set(code, room);
  return room;
}

function createPlayer(id, name) {
  return {
    id,
    name,
    chips: DEFAULT_BUY_IN,
    hand: null,
    score: null,
    rank: null,
    isSeen: false,
    isFolded: false,
    totalBet: 0
  };
}

function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code);
  if (!room) throw new Error('Room not found');
  if (room.state !== 'waiting') throw new Error('Game already in progress');
  if (room.players.length >= 7) throw new Error('Room is full (max 7 players)');
  if (room.players.some(p => p.id === playerId)) throw new Error('Already in room');

  room.players.push(createPlayer(playerId, playerName));
  return room;
}

function leaveRoom(code, playerId) {
  const room = rooms.get(code);
  if (!room) return null;

  room.players = room.players.filter(p => p.id !== playerId);
  room.activePlayers = room.activePlayers.filter(id => id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(code);
    return null;
  }

  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
  }

  return room;
}

function getRoom(code) {
  return rooms.get(code) || null;
}

function getRoomByPlayerId(playerId) {
  for (const [code, room] of rooms) {
    if (room.players.some(p => p.id === playerId)) {
      return room;
    }
  }
  return null;
}

function resetRoom(code) {
  const room = rooms.get(code);
  if (!room) return null;

  room.state = 'waiting';
  room.pot = 0;
  room.currentBet = room.bootAmount;
  room.currentTurnIndex = 0;
  room.activePlayers = [];
  room.roundNumber++;

  room.players.forEach(p => {
    p.hand = null;
    p.score = null;
    p.rank = null;
    p.isSeen = false;
    p.isFolded = false;
    p.totalBet = 0;
  });

  return room;
}

function deleteRoom(code) {
  rooms.delete(code);
}

function getCurrentTurnPlayer(room) {
  if (room.activePlayers.length === 0) return null;
  const id = room.activePlayers[room.currentTurnIndex % room.activePlayers.length];
  return room.players.find(p => p.id === id) || null;
}

function advanceTurn(room) {
  if (room.activePlayers.length <= 1) return;
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.activePlayers.length;
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoom,
  getRoomByPlayerId,
  resetRoom,
  deleteRoom,
  getCurrentTurnPlayer,
  advanceTurn,
  rooms,
  DEFAULT_BUY_IN,
  MIN_BET
};
