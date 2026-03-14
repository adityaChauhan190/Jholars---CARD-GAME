/**
 * Socket.io Client — Betting Version with Coins & Stats
 */
const GameSocket = (() => {
  const socket = io();

  const emit = (ev, data) => new Promise((ok, no) => {
    socket.emit(ev, data, r => r.success ? ok(r) : no(new Error(r.error)));
  });

  return {
    createRoom: (name, boot) => emit('create-room', { playerName: name, bootAmount: boot }),
    joinRoom: (code, name) => emit('join-room', { code, playerName: name }),
    startGame: code => emit('start-game', code),
    seeCards: code => emit('see-cards', code),
    call: code => emit('call', code),
    raise: (code, amount) => emit('raise', { code, amount }),
    fold: code => emit('fold', code),
    show: code => emit('show', code),
    playAgain: code => emit('play-again', code),
    addCoins: (code, amount) => emit('add-coins', { code, amount }),
    startNextRound: code => emit('start-next-round', code),
    endGame: code => emit('end-game', code),
    leaveRoom: code => socket.emit('leave-room', code),
    sendChat: (code, msg) => socket.emit('chat-message', { code, message: msg }),
    kickPlayer: (code, pid) => emit('kick-player', { code, playerId: pid }),
    on: (ev, fn) => socket.on(ev, fn),
    getId: () => socket.id,
    socket
  };
})();
