/**
 * 29-Card Deck Module — Cryptographically Fair
 * 
 * Deck composition:
 *   Values 2–8, each in 4 suits (Hearts, Diamonds, Clubs, Spades) = 28 cards
 *   Value 9, only 1 copy (Hearts) = 1 card
 *   Total = 29 cards
 * 
 * No Ace, no 10, no face cards (J, Q, K).
 * 
 * Uses crypto.randomInt() for unbiased, cryptographically secure shuffling.
 */

const crypto = require('crypto');

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };

function buildDeck() {
  const deck = [];

  // Values 2–8, 4 suits each
  for (let value = 2; value <= 8; value++) {
    for (const suit of SUITS) {
      deck.push({
        value,
        suit,
        symbol: SUIT_SYMBOLS[suit],
        color: SUIT_COLORS[suit],
        id: `${value}-${suit}`
      });
    }
  }

  // Single 9 card (Hearts)
  deck.push({
    value: 9,
    suit: 'hearts',
    symbol: SUIT_SYMBOLS['hearts'],
    color: 'red',
    id: '9-hearts',
    isSpecial: true
  });

  return deck;
}

/**
 * Fisher-Yates shuffle using crypto.randomInt() for unbiased randomness.
 * Math.random() has subtle biases; crypto.randomInt() is cryptographically
 * secure and guarantees uniform distribution.
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deal hands to players. The deck is shuffled, hands are sliced out,
 * then the hands array itself is shuffled so that no player position
 * consistently gets the "first" or "last" cards from the deck.
 */
function deal(playerCount) {
  if (playerCount < 2 || playerCount > 7) {
    throw new Error('Player count must be between 2 and 7');
  }

  const deck = shuffle(buildDeck());
  const hands = [];

  for (let i = 0; i < playerCount; i++) {
    hands.push(deck.slice(i * 3, i * 3 + 3));
  }

  // Shuffle which player gets which hand — eliminates positional bias
  return shuffle(hands);
}

module.exports = { buildDeck, shuffle, deal, SUIT_SYMBOLS, SUIT_COLORS };
