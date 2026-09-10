// Synthetic game states for screenshots and demos. Names and scores are made up;
// nothing here comes from a real game night.
//
//   node Tools/demo-state.mjs            prints the "midgame" state as JSON
//   node Tools/demo-state.mjs longgame   prints a named state
//
// Paste the output into localStorage under the key "score-keeper" to load it.

const CREW = [
  ["Alex", "🦁"], ["Priya", "🌸"], ["Sam", "🚀"], ["Mia", "🦋"], ["Kai", "⚡"], ["Noor", "🐼"],
];

// Small seeded generator so every run produces the same board
function rng(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function players(count, rounds, seed, { min = -5, max = 25 } = {}) {
  const r = rng(seed);
  return CREW.slice(0, count).map(([name, emoji]) => ({
    name, emoji,
    scores: Array.from({ length: rounds }, () => Math.round(min + r() * (max - min))),
  }));
}

export const states = {
  empty: { players: [], target: 200, lowWins: false, seen: false },
  midgame: { players: players(4, 5, 7), target: 200, lowWins: false, seen: false },
  longgame: { players: players(5, 14, 11), target: 300, lowWins: false, seen: false },
  hearts: { players: players(4, 6, 3, { min: 0, max: 26 }), target: 100, lowWins: true, seen: false },
  // one player is a single round away from the target; screenshots.mjs pushes them over
  nearend: { players: players(4, 4, 5, { min: 30, max: 48 }), target: 200, lowWins: false, seen: false },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(states[process.argv[2] || "midgame"], null, 2));
}
