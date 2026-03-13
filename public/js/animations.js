/**
 * Animations Module
 * Card flip, deal, confetti, sound effects, and coin animations
 */

const Animations = (() => {

  // ---- Card Flip ----
  function flipCard(wrapper) {
    const card = wrapper.querySelector('.card');
    if (card) card.classList.add('flipped');
  }

  function flipAllCards(delay = 200) {
    const wrappers = document.querySelectorAll('.card-wrapper');
    wrappers.forEach((w, i) => {
      setTimeout(() => flipCard(w), i * delay);
    });
  }

  // ---- Deal Animation ----
  function dealCards(wrappers) {
    wrappers.forEach((w, i) => {
      w.style.animationDelay = `${i * 150}ms`;
      w.classList.add('dealing');
    });
  }

  // ---- Confetti ----
  function showConfetti(container, count = 80) {
    container.innerHTML = '';
    const colors = ['#f5c518', '#ff9800', '#d32f2f', '#22c55e', '#2563eb', '#7c4dff', '#ec4899'];

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'cf-piece';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = `${1.5 + Math.random() * 2}s`;
      piece.style.animationDelay = `${Math.random() * 1.5}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      piece.style.width = `${6 + Math.random() * 6}px`;
      piece.style.height = `${10 + Math.random() * 10}px`;
      container.appendChild(piece);
    }

    // Clean up after animation
    setTimeout(() => { container.innerHTML = ''; }, 5000);
  }

  // ---- Shake (error feedback) ----
  function shake(element) {
    element.style.animation = 'none';
    element.offsetHeight; // force reflow
    element.style.animation = 'shake 0.4s ease';
  }

  // ---- Sound Effects (Web Audio API) ----
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playTone(freq, duration, type = 'sine', volume = 0.12) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* audio not supported */ }
  }

  function soundDeal() {
    playTone(800, 0.08, 'square', 0.06);
  }

  function soundFlip() {
    playTone(1200, 0.1, 'sine', 0.08);
  }

  function soundWin() {
    setTimeout(() => playTone(523, 0.15, 'sine', 0.1), 0);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.1), 150);
    setTimeout(() => playTone(784, 0.25, 'sine', 0.1), 300);
  }

  function soundError() {
    playTone(200, 0.2, 'sawtooth', 0.05);
  }

  function soundJoin() {
    playTone(600, 0.1, 'sine', 0.06);
    setTimeout(() => playTone(900, 0.1, 'sine', 0.06), 100);
  }

  function soundCoin() {
    playTone(1400, 0.06, 'sine', 0.08);
    setTimeout(() => playTone(1800, 0.08, 'sine', 0.06), 60);
  }

  function soundCountdown() {
    playTone(440, 0.08, 'square', 0.04);
  }

  // ---- Fly Chips to Winner ----
  function flyChipsToWinner(winnerEl, count = 5) {
    const layer = document.getElementById('chip-anim');
    const potEl = document.getElementById('pot-center');
    if (!winnerEl || !potEl || !layer) return;
    const from = potEl.getBoundingClientRect();
    const to = winnerEl.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const chip = document.createElement('div');
      chip.className = 'fly-chip';
      chip.style.left = (from.left + from.width / 2 - 7) + 'px';
      chip.style.top = (from.top + from.height / 2 - 7) + 'px';
      chip.style.transition = `all ${0.4 + i * 0.08}s cubic-bezier(.2,.8,.3,1)`;
      layer.appendChild(chip);
      requestAnimationFrame(() => {
        chip.style.left = (to.left + to.width / 2 - 7 + (Math.random() - .5) * 16) + 'px';
        chip.style.top = (to.top + to.height / 2 - 7) + 'px';
        chip.style.opacity = '0';
      });
      setTimeout(() => chip.remove(), 700);
    }
  }

  return {
    flipCard, flipAllCards, dealCards, showConfetti,
    shake, soundDeal, soundFlip, soundWin, soundError, soundJoin,
    soundCoin, soundCountdown, flyChipsToWinner
  };
})();
