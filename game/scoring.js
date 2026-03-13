/**
 * Scoring Module for 29 Sum Card Game
 * 
 * Scoring rules:
 *   1. Sum all 3 card values
 *   2. finalScore = sum % 10 (keep last digit)
 *   3. Trial (three of a kind) beats all normal hands; higher trial wins
 *   4. If player holds the unique 9 card, they get +0.5 bonus on finalScore
 *   5. Tiebreakers: trial > finalScore > 9-card bonus > raw total > highest individual card
 */

function isTrial(hand) {
  return hand[0].value === hand[1].value && hand[1].value === hand[2].value;
}

function has9Card(hand) {
  return hand.some(card => card.value === 9);
}

function calculateScore(hand) {
  const total = hand.reduce((sum, card) => sum + card.value, 0);
  const lastDigit = total % 10;
  const trial = isTrial(hand);
  const holds9 = has9Card(hand);
  const bonus = holds9 ? 0.5 : 0;
  const finalScore = lastDigit + bonus;
  const highestCard = Math.max(...hand.map(c => c.value));

  return {
    total,
    lastDigit,
    finalScore,
    trial,
    trialValue: trial ? hand[0].value : null,
    holds9,
    bonus,
    highestCard
  };
}

/**
 * Rank players from best to worst.
 * Each player object: { id, name, hand, score (from calculateScore) }
 * Returns a sorted copy with `rank` field added.
 */
function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => {
    const sa = a.score;
    const sb = b.score;

    // 1. Trials beat non-trials
    if (sa.trial && !sb.trial) return -1;
    if (!sa.trial && sb.trial) return 1;

    // 2. Among trials, higher trial value wins
    if (sa.trial && sb.trial) {
      return sb.trialValue - sa.trialValue;
    }

    // 3. Higher final score (includes 9-card +0.5 bonus)
    if (sb.finalScore !== sa.finalScore) {
      return sb.finalScore - sa.finalScore;
    }

    // 4. Higher raw total before mod
    if (sb.total !== sa.total) {
      return sb.total - sa.total;
    }

    // 5. Higher individual card
    return sb.highestCard - sa.highestCard;
  });

  // Assign ranks (1-based). Ties get same rank.
  sorted.forEach((player, idx) => {
    if (idx === 0) {
      player.rank = 1;
    } else {
      const prev = sorted[idx - 1];
      const same =
        player.score.trial === prev.score.trial &&
        player.score.trialValue === prev.score.trialValue &&
        player.score.finalScore === prev.score.finalScore &&
        player.score.total === prev.score.total &&
        player.score.highestCard === prev.score.highestCard;
      player.rank = same ? prev.rank : idx + 1;
    }
  });

  return sorted;
}

module.exports = { calculateScore, rankPlayers, isTrial, has9Card };
