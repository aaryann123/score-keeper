# Architecture

Score Keeper is one HTML file. There is no framework, no bundler, and no server-side code; the
dev server and the Cloudflare config only deliver the file. Everything below is about the
script inside `public/index.html`.

```
localStorage["score-keeper"]
        │ load once
        ▼
   state { players[], target, lowWins, seen }
        │
   commit()  ──►  save()  ──►  render()  ──►  standings()  ──►  DOM
        │                                                    (board, chips, status)
        └──►  target reached and not seen?  ──►  showGameOver()
```

## Files

| File | Responsibility |
|---|---|
| `public/index.html` | Styles, markup, and the script: state, rendering, ranking, animations, dialogs, speech. |
| `server.mjs` | Serves that file on 127.0.0.1:6161 (or `$PORT`). Re-reads it on every request, so edits show on reload. |
| `wrangler.jsonc` | Points Cloudflare Workers static assets at `public/`. No Worker script. |
| `Tools/demo-state.mjs` | Deterministic synthetic game states. |
| `Tools/screenshots.mjs` | Drives headless Chrome to capture `docs/screenshots/`. |

## State and rendering

One `state` object holds everything: the player list (`name`, `emoji`, `scores[]`), the target
score, the `lowWins` flag, and `seen`, which records whether the current game's end screen has
been dismissed. Every mutation goes through `commit()`, which saves to `localStorage`, calls
`render()`, and then checks whether the game has just ended.

`render()` rebuilds the whole board from scratch each time rather than patching individual
cards. At the size of a game night (a handful of players, a few dozen rounds) that is
instantaneous, and it removes a whole class of "the DOM drifted from the data" bugs. The cost is
that focus and scroll position are lost on every render, which is why `render()` takes an
optional player index to refocus after a score is entered.

Older saves were a bare array of players. The loader wraps one of those in the new settings
object and fills in missing emojis, so a board from before the settings existed still loads.

## Ranking

`standings()` sums each player's scores, sorts by total in the direction chosen by `lowWins`,
and assigns ranks. A player whose total equals the one above them inherits that rank, so two
players on 74 are both rank 1 and the next is rank 3. The leader's crown only appears once at
least one score has been entered, so an empty board has no leader.

Totals are rounded to two decimals with `toFixed(2)` before display and comparison. Scores can
be fractional, and without the rounding a sequence like 0.1 + 0.2 shows up as
0.30000000000000004.

## Rank-change animation

Because `render()` replaces every card, an ordinary CSS transition cannot animate a card moving
from third to first. The board uses the FLIP technique instead: before clearing the container,
`render()` records each card's top edge keyed by player index. After the new cards are in place,
it measures them again and, for any card that moved, plays a Web Animations API transform from
the old offset to zero. The result reads as cards sliding into their new order. The pass is
skipped under `prefers-reduced-motion`.

## Game over

`commit()` calls `showGameOver()` when any total is at or beyond the target and `seen` is false.
The overlay shows the first- and last-ranked players from `standings()`, so under "lowest wins"
the player who crossed the target is the one who finishes last. Seventy confetti pieces are
generated with random horizontal positions, delays, and durations and animated with a single
CSS keyframe. "Keep playing" sets `seen` so the overlay does not return until the target or the
win direction changes; "New game" clears scores and resets `seen`.

The spoken "Losers!" is a `SpeechSynthesisUtterance` with a low pitch and slow rate. Browsers
refuse speech until the page has had a user gesture; entering a score satisfies that, which is
why the line plays even though nothing in the code asks for permission.

## Confirmations

Removing a player and starting a new game both go through a native `<dialog>` opened with
`showModal()`. The `ask()` helper returns a promise that resolves from the dialog form's
`submit` event, reading `event.submitter.value` to tell the action button from Cancel, and from
the `cancel` event for Escape. Focus trapping, the backdrop, and Escape handling all come from
the browser.

## Things that bit us

- **Inline SVG icons with no height.** An `<svg><use href="#icon"/></svg>` with only a CSS
  width gets the browser's default 150px height, and every card grew to 200px tall. Every icon
  now sets both width and height.
- **The dialog's `close` event did not fire for a scripted submit.** Resolving the confirm
  promise from `close` worked for a real click on Cancel and silently never resolved when the
  action button was submitted from script. Listening to the form's `submit` event instead is
  reliable in both cases.
- **Speech synthesis is silently blocked before a gesture.** Calling `speak()` on page load does
  nothing and raises no error. Triggering it from the same click that ends the game is what
  makes it audible.
- **A Cloudflare `account_id` in `wrangler.jsonc` beats the environment variable.** Deleting a
  Worker from a different account needed a throwaway config in another directory; setting
  `CLOUDFLARE_ACCOUNT_ID` alone still targeted the pinned account.
- **A fresh `workers.dev` subdomain fails TLS for about a minute.** `curl` reports a handshake
  failure right after the first deploy. It resolves on its own; nothing is misconfigured.
- **DevTools `/json/list` is not just tabs.** Chrome 152 lists browser UI pages and extension
  service workers before the actual page, and the first entry is never the one you want.
  The screenshot script filters on `type === "page"`.
