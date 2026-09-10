# Score Keeper

A scoreboard for card and board game nights. One HTML file, no build step, no backend.
Scores stay in the browser that entered them.

## Why

Paper scoresheets get lost and phone notes apps make you do the adding. This puts the running
totals on screen, sorted, with the leader on top, and calls the game when someone hits the
target.

## What it does

- **Round-based entry.** Type each player's score for the round and press one button. Cards
  re-sort and slide into their new rank order.
- **Highest or lowest wins.** A toggle flips the ranking, so it works for Rummy as well as
  Hearts. Tied totals share a rank.
- **Target score.** Defaults to 200. When any total reaches it, a game-over screen names the
  winner with confetti and the last-place player with a drooping emoji, and the browser says
  "Losers!" out loud via the Web Speech API. You can keep playing or start a new game.
- **Emoji avatars.** Every player gets one. Tap it to cycle through eighteen options.
- **Quick-add chips.** Five names are offered under the input; edit the `SUGGESTED` constant
  to make them your regulars.
- **History per player.** The last eight round scores show as chips, negatives in red, with
  the full list on hover.
- **Persists between visits.** State is saved to `localStorage` under the key `score-keeper`.
  Nothing is sent anywhere.

## Quick start

Requires Node 18 or newer.

```bash
git clone <this repo> score-keeper
cd score-keeper
npm run dev
```

Open http://127.0.0.1:6161. The dev server is ten lines of `node:http` that serve
`public/index.html`; you can also open that file directly in a browser.

To host it, `wrangler.jsonc` is set up for Cloudflare Workers static assets:

```bash
npx wrangler login
npm run deploy
```

## How it works

Everything lives in `public/index.html`. The script keeps one `state` object (players,
target, `lowWins`, and whether the game-over screen has been dismissed) and re-renders the
whole board from it after every change. `standings()` sorts players by total in the chosen
direction and assigns ranks. Rank changes animate with a FLIP pass: card positions are
recorded before the re-render and each card is translated from its old position to its new
one. Confirmations use the native `<dialog>` element. Fonts come from Google Fonts with system
fallbacks.

## Limitations

- Scores are per browser. Two phones at the same table keep two separate boards.
- The spoken "Losers!" depends on the browser's speech engine and only plays after the page
  has been interacted with, which entering a score satisfies.
- Removing a player drops their scores; there is no undo.

## Licence

MIT, see LICENSE. Fonts are Bricolage Grotesque and JetBrains Mono, both under the
[SIL Open Font License](https://openfontlicense.org/).
