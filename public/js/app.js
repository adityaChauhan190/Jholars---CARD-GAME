/**
 * JHOLARS — Main Client App
 * Stake-based betting with flexible raise stepper
 * Features: Add Coins, Auto Round, Statistics, Game End Summary
 */
; (function () {
  'use strict';

  let room = null, myId = null, myName = '', isHost = false;
  let bootAmt = 10, isSeen = false, myHand = null, unread = 0;
  let lastState = null, raiseAmt = 20;

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const COLORS = ['#f5c518', '#1e88e5', '#43a047', '#e53935', '#7c4dff', '#ec407a', '#ff9800'];

  const screens = { landing: $('#screen-landing'), lobby: $('#screen-lobby'), game: $('#screen-game'), results: $('#screen-results'), stats: $('#screen-stats') };
  function showScreen(n) { Object.values(screens).forEach(s => s.classList.remove('active')); screens[n].classList.add('active'); }
  function toast(m, t = 'info') { const d = document.createElement('div'); d.className = `toast toast-${t}`; d.textContent = m; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 3200); }
  function betNotif(msg) { const el = $('#bet-notif'); el.textContent = msg; el.classList.remove('hidden'); el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; setTimeout(() => el.classList.add('hidden'), 2200); }

  // === Chip Fly Animation ===
  function flyChips(fromEl, count = 3) {
    const layer = $('#chip-anim');
    const potEl = $('#pot-center');
    if (!fromEl || !potEl) return;
    const fr = fromEl.getBoundingClientRect();
    const to = potEl.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const chip = document.createElement('div');
      chip.className = 'fly-chip';
      chip.style.left = (fr.left + fr.width / 2 - 7) + 'px';
      chip.style.top = (fr.top + fr.height / 2 - 7) + 'px';
      chip.style.transition = `all ${0.35 + i * 0.08}s cubic-bezier(.2,.8,.3,1)`;
      layer.appendChild(chip);
      requestAnimationFrame(() => {
        chip.style.left = (to.left + to.width / 2 - 7 + (Math.random() - .5) * 16) + 'px';
        chip.style.top = (to.top + to.height / 2 - 7) + 'px';
        chip.style.opacity = '0';
      });
      setTimeout(() => chip.remove(), 600);
    }
  }

  // Update pot display with coin icons
  function updatePotDisplay(potAmount) {
    const el = $('#pot-val');
    const oldVal = parseInt(el.textContent) || 0;
    el.textContent = potAmount;
    if (potAmount > oldVal) {
      el.style.transform = 'scale(1.15)';
      el.style.color = '#fff';
      setTimeout(() => { el.style.transform = 'scale(1)'; el.style.color = ''; }, 300);
    }
    // Update coins visual
    const coinsEl = $('#pot-coins');
    const coinCount = Math.min(Math.floor(potAmount / 10), 8);
    const current = coinsEl.children.length;
    if (coinCount > current) {
      for (let i = current; i < coinCount; i++) {
        const c = document.createElement('div');
        c.className = 'pot-coin';
        c.style.animationDelay = `${(i - current) * 60}ms`;
        coinsEl.appendChild(c);
      }
    }
  }

  // ==== LANDING ====
  $('#btn-create').onclick = () => { $('#m-create').classList.remove('hidden'); $('#i-cname').focus(); };
  $('#btn-join').onclick = () => { $('#m-join').classList.remove('hidden'); $('#i-jname').focus(); };
  $$('.modal-x[data-close]').forEach(b => b.onclick = () => document.getElementById(b.dataset.close).classList.add('hidden'));
  $$('.modal-overlay').forEach(b => b.onclick = () => b.closest('.modal').classList.add('hidden'));
  $$('.boot-chip').forEach(b => b.onclick = () => { $$('.boot-chip').forEach(x => x.classList.remove('active')); b.classList.add('active'); bootAmt = +b.dataset.b; });

  $('#i-cname').onkeydown = e => { if (e.key === 'Enter') $('#btn-cc').click(); };
  $('#i-jname').onkeydown = e => { if (e.key === 'Enter') $('#i-jcode').focus(); };
  $('#i-jcode').onkeydown = e => { if (e.key === 'Enter') $('#btn-jc').click(); };

  $('#btn-cc').onclick = async () => {
    const n = $('#i-cname').value.trim();
    if (!n) return toast('Enter your name', 'error');
    myName = n;
    try { $('#btn-cc').disabled = true; const r = await GameSocket.createRoom(n, bootAmt); myId = r.playerId; room = { code: r.room.code, hostId: r.room.hostId, boot: r.room.bootAmount }; isHost = true; $('#m-create').classList.add('hidden'); enterLobby(r.room); Animations.soundJoin(); }
    catch (e) { toast(e.message, 'error'); }
    finally { $('#btn-cc').disabled = false; }
  };

  $('#btn-jc').onclick = async () => {
    const n = $('#i-jname').value.trim(), c = $('#i-jcode').value.trim();
    if (!n) return toast('Enter your name', 'error');
    if (!c || c.length !== 6) return toast('Enter 6-digit code', 'error');
    myName = n;
    try { $('#btn-jc').disabled = true; const r = await GameSocket.joinRoom(c, n); myId = r.playerId; room = { code: r.room.code, hostId: r.room.hostId, boot: r.room.bootAmount }; isHost = r.room.hostId === myId; $('#m-join').classList.add('hidden'); enterLobby(r.room); Animations.soundJoin(); }
    catch (e) { toast(e.message, 'error'); }
    finally { $('#btn-jc').disabled = false; }
  };

  // ==== LOBBY ====
  function enterLobby(rm) { showScreen('lobby'); $('#lob-code').textContent = rm.code; renderPlayers(rm.players, rm.hostId); }
  function renderPlayers(players, hostId) {
    const g = $('#players-grid'); g.innerHTML = '';
    players.forEach((p, i) => {
      const c = document.createElement('div'); c.className = 'p-card';
      const av = document.createElement('div'); av.className = 'p-av'; av.style.background = COLORS[i % COLORS.length]; av.textContent = p.name[0].toUpperCase();
      const info = document.createElement('div'); info.className = 'p-info';
      const nm = document.createElement('div'); nm.className = 'p-name'; nm.textContent = p.name; info.appendChild(nm);
      if (p.id === hostId) { const h = document.createElement('div'); h.className = 'p-host'; h.textContent = 'HOST'; info.appendChild(h); }
      const ch = document.createElement('div'); ch.className = 'p-chips'; ch.textContent = `💰 ${p.chips}`; info.appendChild(ch);
      c.appendChild(av); c.appendChild(info);
      if (isHost && p.id !== myId) { const k = document.createElement('button'); k.className = 'p-kick'; k.textContent = '✕'; k.onclick = async () => { try { await GameSocket.kickPlayer(room.code, p.id); toast(`${p.name} kicked`); } catch (e) { toast(e.message, 'error'); } }; c.appendChild(k); }
      g.appendChild(c);
    });
    const btn = $('#btn-start'), msg = $('#wait-msg');
    if (isHost && players.length >= 2) { btn.classList.remove('hidden'); msg.textContent = `Boot: ₹${room.boot || bootAmt}`; }
    else if (isHost) { btn.classList.add('hidden'); msg.textContent = 'Need at least 2 players…'; }
    else { btn.classList.add('hidden'); msg.textContent = 'Waiting for host to start…'; }
  }

  $('#btn-copy').onclick = () => navigator.clipboard.writeText(room.code).then(() => toast('Code copied!', 'success'));
  $('#btn-back').onclick = () => { GameSocket.leaveRoom(room.code); reset(); showScreen('landing'); };
  $('#btn-start').onclick = async () => { try { $('#btn-start').disabled = true; await GameSocket.startGame(room.code); } catch (e) { toast(e.message, 'error'); } finally { $('#btn-start').disabled = false; } };

  // Chat
  $('#chat-fab').onclick = () => { const p = $('#chat-panel'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) { unread = 0; $('#c-badge').classList.add('hidden'); $('#i-chat').focus(); } };
  $('#cp-close').onclick = () => $('#chat-panel').classList.add('hidden');
  $('#btn-chat').onclick = sendChat; $('#i-chat').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
  function sendChat() { const m = $('#i-chat').value.trim(); if (!m || !room) return; GameSocket.sendChat(room.code, m); $('#i-chat').value = ''; }

  // ==== GAME ====
  function enterGame() { showScreen('game'); isSeen = false; myHand = null; raiseAmt = 20; updateRaiseDisplay(); renderBackCards(); $('#pot-coins').innerHTML = ''; }

  function renderBackCards() {
    const c = $('#hand-cards'); c.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div'); d.className = 'gc gc-back';
      d.innerHTML = '<div class="gc-back-in">J</div>';
      d.style.opacity = '0'; d.style.transform = 'translateY(-20px) scale(.85)';
      c.appendChild(d);
      setTimeout(() => { d.style.transition = 'all .3s ease'; d.style.opacity = '1'; d.style.transform = 'translateY(0) scale(1)'; Animations.soundDeal(); }, i * 100 + 60);
    }
  }

  function renderFrontCards(hand) {
    const c = $('#hand-cards'); c.innerHTML = '';
    hand.forEach((card, i) => {
      const d = document.createElement('div');
      d.className = `gc gc-front ${card.color}${card.value === 9 ? ' g9' : ''}`;
      d.innerHTML = `<div class="ft"><span class="fv">${card.value}</span><span class="fs">${card.symbol}</span></div><span class="fc">${card.symbol}</span><div class="fb"><span class="fv">${card.value}</span><span class="fs">${card.symbol}</span></div>`;
      d.classList.add('flip'); d.style.animationDelay = `${i * 100}ms`;
      c.appendChild(d);
      setTimeout(() => Animations.soundFlip(), i * 100);
    });
  }

  function renderSeats(players, turnId) {
    const s = $('#seats'); s.innerHTML = '';
    const mi = players.findIndex(p => p.id === myId);
    const ord = []; for (let i = 0; i < players.length; i++) ord.push(players[(mi + i) % players.length]);
    ord.forEach((p, i) => {
      if (i === 0) return;
      const seat = document.createElement('div'); seat.className = 'seat'; seat.dataset.p = i; seat.dataset.pid = p.id;
      const av = document.createElement('div'); av.className = 'seat-av'; av.style.background = COLORS[players.indexOf(p) % COLORS.length]; av.textContent = p.name[0].toUpperCase();
      if (p.id === turnId) av.classList.add('turn');
      if (p.isFolded) av.classList.add('folded'); else if (p.isSeen) av.classList.add('seen');
      const nm = document.createElement('div'); nm.className = 'seat-nm'; nm.textContent = p.name;
      const ch = document.createElement('div'); ch.className = 'seat-ch'; ch.textContent = `💰${p.chips}`;
      const st = document.createElement('div'); st.className = 'seat-st';
      if (p.isFolded) { st.classList.add('sf'); st.textContent = 'FOLD'; }
      else if (p.isSeen) { st.classList.add('ss'); st.textContent = 'SEEN'; }
      else { st.classList.add('sb'); st.textContent = 'BLIND'; }
      seat.append(av, nm, ch, st); s.appendChild(seat);
    });
  }

  function updateUI(st) {
    const prev = lastState;
    lastState = st;

    updatePotDisplay(st.pot);
    $('#stake-val').textContent = st.stake;

    const me = st.players.find(p => p.id === myId);
    if (me) {
      $('#hi-chips').textContent = me.chips;
      isSeen = st.isSeen;
      const badge = $('#hi-status');
      if (st.isFolded) { badge.textContent = 'FOLDED'; badge.className = 'hi-badge folded'; }
      else if (isSeen) { badge.textContent = 'SEEN'; badge.className = 'hi-badge seen'; }
      else { badge.textContent = 'BLIND'; badge.className = 'hi-badge blind'; }
    }

    if (st.isSeen && st.myHand && !myHand) { myHand = st.myHand; renderFrontCards(myHand); }
    renderSeats(st.players, st.currentTurnId);

    // Turn label
    const turn = $('#ap-turn');
    if (st.isMyTurn) { turn.textContent = '🔥 Your turn!'; turn.className = 'ap-turn mine'; }
    else if (st.currentTurnName) { turn.textContent = `${st.currentTurnName}'s turn`; turn.className = 'ap-turn'; }
    else { turn.textContent = 'Waiting…'; turn.className = 'ap-turn'; }

    // Cost display
    const cost = $('#ap-cost');
    cost.innerHTML = isSeen ? `Seen: <strong>₹${st.seenCost}</strong>` : `Blind: <strong>₹${st.blindCost}</strong>`;
    $('#call-val').textContent = `₹${st.myCost}`;

    // Buttons
    const myTurn = st.isMyTurn && !st.isFolded;
    $('#a-see').disabled = isSeen;
    $('#a-call').disabled = !myTurn;
    $('#a-fold').disabled = !myTurn;
    $('#a-raise').disabled = !myTurn;
    $('#r-minus').disabled = !myTurn;
    $('#r-plus').disabled = !myTurn;
    $$('.preset').forEach(p => p.disabled = !myTurn);

    // Show button only with 2 active players (blind or seen)
    const showBtn = $('#a-show');
    if (st.activePlayers === 2) { showBtn.classList.remove('hidden'); showBtn.disabled = !myTurn; }
    else { showBtn.classList.add('hidden'); }

    // Update raise min/display
    updateRaiseMin();
  }

  // === Raise Stepper ===
  function updateRaiseMin() {
    if (!lastState) return;
    const minRaise = lastState.myCost + 10;
    if (raiseAmt < minRaise) raiseAmt = minRaise;
    raiseAmt = Math.round(raiseAmt / 10) * 10;
    updateRaiseDisplay();
  }

  function updateRaiseDisplay() {
    $('#r-val').textContent = raiseAmt;
    // Highlight matching preset
    $$('.preset').forEach(p => p.classList.toggle('active', +p.dataset.p === raiseAmt));
    // Update confirm button text
    $('#a-raise').textContent = `Confirm Raise ₹${raiseAmt}`;
  }

  $('#r-minus').onclick = () => {
    const min = lastState ? lastState.myCost + 10 : 20;
    raiseAmt = Math.max(min, raiseAmt - 10);
    updateRaiseDisplay();
  };
  $('#r-plus').onclick = () => {
    const me = lastState?.players?.find(p => p.id === myId);
    const maxChips = me ? me.chips : 1000;
    raiseAmt = Math.min(maxChips, raiseAmt + 10);
    updateRaiseDisplay();
  };
  $$('.preset').forEach(btn => {
    btn.onclick = () => {
      const val = +btn.dataset.p;
      const min = lastState ? lastState.myCost + 10 : 20;
      raiseAmt = Math.max(min, val);
      raiseAmt = Math.round(raiseAmt / 10) * 10;
      updateRaiseDisplay();
    };
  });

  // === Actions ===
  $('#a-see').onclick = async () => {
    if (!room) return;
    try { const r = await GameSocket.seeCards(room.code); myHand = r.hand; renderFrontCards(r.hand); }
    catch (e) { toast(e.message, 'error'); }
  };

  $('#a-call').onclick = async () => {
    if (!room) return;
    try {
      await GameSocket.call(room.code);
      flyChips($('#hand-dock'), 3);
      Animations.soundDeal();
      betNotif(`${myName} called ₹${lastState.myCost}`);
    } catch (e) { toast(e.message, 'error'); }
  };

  $('#a-raise').onclick = async () => {
    if (!room || !lastState) return;
    try {
      await GameSocket.raise(room.code, raiseAmt);
      flyChips($('#hand-dock'), 5);
      Animations.soundDeal();
      betNotif(`${myName} raised to ₹${raiseAmt}`);
    } catch (e) { toast(e.message, 'error'); }
  };

  $('#a-fold').onclick = async () => {
    if (!room) return;
    try { await GameSocket.fold(room.code); Animations.soundError(); betNotif(`${myName} packed`); }
    catch (e) { toast(e.message, 'error'); }
  };

  $('#a-show').onclick = async () => {
    if (!room) return;
    try { await GameSocket.show(room.code); }
    catch (e) { toast(e.message, 'error'); }
  };

  // === ADD COINS ===
  $('#btn-add-coins').onclick = () => { $('#m-addcoins').classList.remove('hidden'); };
  $$('.coin-opt').forEach(btn => {
    btn.onclick = async () => {
      if (!room) return;
      const amount = parseInt(btn.dataset.coins);
      try {
        btn.disabled = true;
        await GameSocket.addCoins(room.code, amount);
        Animations.soundCoin();
        toast(`Added +${amount} coins!`, 'success');
        $('#m-addcoins').classList.add('hidden');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    };
  });

  // === COUNTDOWN TIMER ===
  function startCountdown() {
    stopCountdown();
    countdownValue = 20;
    const cdBar = $('#countdown-bar');
    const cdSec = $('#cd-seconds');
    const cdFill = $('#cd-fill');
    cdBar.classList.remove('hidden');
    cdSec.textContent = countdownValue;
    cdFill.style.transition = 'none';
    cdFill.style.width = '100%';

    // Trigger reflow and animate
    cdFill.offsetHeight;
    cdFill.style.transition = 'width 20s linear';
    cdFill.style.width = '0%';

    countdownInterval = setInterval(() => {
      countdownValue--;
      cdSec.textContent = Math.max(0, countdownValue);
      Animations.soundCountdown();
      if (countdownValue <= 0) {
        stopCountdown();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  // ==== RESULTS ====
  function showResults(data) {
    showScreen('results');
    $('#w-name').textContent = data.winnerName;
    $('#w-pot').textContent = `+₹${data.pot}`;
    Animations.showConfetti($('#confetti'));
    Animations.soundWin();

    const list = $('#res-list'); list.innerHTML = '';
    const sorted = [...data.results].sort((a, b) => {
      if (a.id === data.winnerId) return -1; if (b.id === data.winnerId) return 1;
      if (a.isFolded && !b.isFolded) return 1; if (!a.isFolded && b.isFolded) return -1;
      return (b.score?.finalScore || 0) - (a.score?.finalScore || 0);
    });

    sorted.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'r-card' + (p.id === data.winnerId ? ' win' : '') + (p.isFolded ? ' fold' : '');
      card.style.animationDelay = `${idx * 50}ms`;
      let h = `<div class="r-head"><div class="r-rank${p.id === data.winnerId ? ' r1' : ''}">${p.id === data.winnerId ? '🏆' : '#' + (idx + 1)}</div><span class="r-name">${esc(p.name)}</span>`;
      if (p.isFolded) h += '<span class="r-fold">FOLDED</span>';
      else if (p.score?.trial) h += '<span class="r-trial">TRIAL</span>';
      if (p.score && !p.isFolded) h += `<span class="r-score">${p.score.finalScore}</span>`;
      h += '</div>';
      let cards = '';
      if (p.hand) { cards = '<div class="r-cards">' + p.hand.map(c => `<div class="r-mc ${c.color}${c.value === 9 ? ' s9' : ''}"><span class="rv">${c.value}</span><span class="rsu">${c.symbol}</span></div>`).join('') + '</div>'; }
      let det = '';
      if (p.score && !p.isFolded) { det = `<div class="r-det"><span>Sum: ${p.score.total}</span><span>Score: ${p.score.lastDigit}</span>${p.score.holds9 ? '<span>🌟 +0.5</span>' : ''}<span>Bet: ₹${p.totalBet}</span><span>💰 ${p.chips}</span></div>`; }
      card.innerHTML = h + cards + det;
      list.appendChild(card);
    });

    // Show host controls or waiting message
    const hostControls = $('#host-controls');
    const waitMsg = $('#wait-next-round');
    const resultHostId = data.hostId || (room && room.hostId);
    if (myId === resultHostId) {
      hostControls.classList.remove('hidden');
      waitMsg.classList.add('hidden');
    } else {
      hostControls.classList.add('hidden');
      waitMsg.classList.remove('hidden');
    }
  }

  // Start Next Round (host only)
  $('#btn-next-round').onclick = async () => {
    if (!room) return;
    try {
      $('#btn-next-round').disabled = true;
      await GameSocket.startNextRound(room.code);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      $('#btn-next-round').disabled = false;
    }
  };

  // End Game
  $('#btn-end-game').onclick = async () => {
    if (!room) return;
    try {
      await GameSocket.endGame(room.code);
    } catch (e) { toast(e.message, 'error'); }
  };

  $('#btn-leave').onclick = () => { GameSocket.leaveRoom(room.code); reset(); showScreen('landing'); };

  // ==== STATS SCREEN ====
  function showStatsScreen(summary) {
    showScreen('stats');
    stopCountdown();

    // Sort by profit/loss descending
    const sorted = [...summary].sort((a, b) => b.profitLoss - a.profitLoss);
    const tbody = $('#stats-body');
    tbody.innerHTML = '';

    sorted.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.className = idx === 0 ? 'stat-row winner' : 'stat-row';
      tr.style.animationDelay = `${idx * 80}ms`;

      const plClass = p.profitLoss >= 0 ? 'stat-profit' : 'stat-loss';
      const plSign = p.profitLoss >= 0 ? '+' : '';

      tr.innerHTML = `
        <td class="stat-rank">${idx === 0 ? '🏆' : idx + 1}</td>
        <td class="stat-name">${esc(p.name)}</td>
        <td>${p.roundsPlayed}</td>
        <td>${p.roundsWon}</td>
        <td>₹${p.totalAmountBet}</td>
        <td>₹${p.finalBalance}</td>
        <td class="${plClass}">${plSign}₹${p.profitLoss}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  $('#btn-stats-leave').onclick = () => { reset(); showScreen('landing'); };

  // ==== SOCKET EVENTS ====
  GameSocket.on('player-joined', d => { if (room) { renderPlayers(d.players, room.hostId); if (d.newPlayer) toast(`${d.newPlayer} joined`, 'success'); Animations.soundJoin(); } });
  GameSocket.on('player-left', d => { if (room) { room.hostId = d.hostId; isHost = d.hostId === myId; renderPlayers(d.players, d.hostId); toast(`${d.leftPlayer} left`); } });
  GameSocket.on('game-state', st => {
    // Track host from game-state
    if (st.hostId && room) { room.hostId = st.hostId; isHost = st.hostId === myId; }
    if (screens.game.classList.contains('active')) {
      // Detect if someone else bet (pot increased, not my turn anymore)
      if (lastState && st.pot > lastState.pot && lastState.currentTurnId !== myId) {
        const who = lastState.players.find(p => p.id === lastState.currentTurnId);
        const diff = st.pot - lastState.pot;
        if (who) {
          betNotif(`${who.name} bet ₹${diff}`);
          // Fly chips from that player's seat
          const seatEl = document.querySelector(`[data-pid="${who.id}"]`);
          if (seatEl) flyChips(seatEl, 3);
        }
      }
      updateUI(st);
    } else { enterGame(); setTimeout(() => updateUI(st), 350); }
  });
  GameSocket.on('results', d => showResults(d));

  // Next-round events (host-controlled)
  GameSocket.on('next-round-started', d => {
    toast(`Round ${d.roundNumber} starting!`, 'info');
    myHand = null; isSeen = false; lastState = null; raiseAmt = 20;
    // enterGame() will be called when game-state arrives
  });

  GameSocket.on('round-start-failed', d => {
    toast(d.reason || 'Could not start round', 'error');
  });

  // Coins added notification
  GameSocket.on('coins-added', d => {
    if (d.playerId !== myId) {
      toast(`${d.playerName} added +${d.amount} coins`, 'info');
    }
  });

  // Game ended — show stats
  GameSocket.on('game-ended', d => {
    showStatsScreen(d.summary);
  });

  GameSocket.on('room-reset', d => { room.hostId = d.hostId; isHost = d.hostId === myId; myHand = null; isSeen = false; lastState = null; raiseAmt = 20; enterLobby({ code: room.code, players: d.players, hostId: d.hostId }); toast('New round'); });
  GameSocket.on('chat-message', d => {
    const div = document.createElement('div'); div.className = 'chat-msg';
    div.innerHTML = `<span class="cn">${esc(d.name)}:</span><span class="ct">${esc(d.message)}</span>`;
    $('#chat-msgs').appendChild(div); $('#chat-msgs').scrollTop = 1e5;
    if ($('#chat-panel').classList.contains('hidden')) { unread++; $('#c-badge').textContent = unread; $('#c-badge').classList.remove('hidden'); }
  });
  GameSocket.on('kicked', () => { reset(); showScreen('landing'); toast('You were kicked', 'error'); });

  function reset() { room = null; myHand = null; isHost = false; isSeen = false; unread = 0; lastState = null; raiseAmt = 20; $('#chat-msgs').innerHTML = ''; $('#i-cname').value = ''; $('#i-jname').value = ''; $('#i-jcode').value = ''; $('#chat-panel').classList.add('hidden'); $('#c-badge').classList.add('hidden'); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  GameSocket.socket.on('connect', () => { myId = GameSocket.getId(); });
})();
