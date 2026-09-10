# Architecture

Score Keeper is one HTML page plus a Worker with a few JSON endpoints, a Durable Object per
shared board, and a D1 (SQLite) database. There is no framework and no bundler. A solo game
lives in the browser; a shared game lives in its room; finished games reach the database.

```
localStorage["score-keeper"]                      D1: players, games, game_players
        │ load once                                        ▲            │
        ▼                                                  │            │ GET /api/leaderboard
   state { players[], target, lowWins, seen, recorded }    │            ▼
        │                                                  │        roster[] ──► chips, hall of fame
   commit()  ──►  save()  ──►  render()  ──►  standings()  │
        │                                                  │
        └──►  target reached and not seen?  ──►  showGameOver()  ──►  POST /api/games
```

## Files

| File | Responsibility |
|---|---|
| `public/index.html` | Styles, markup, and the script: state, rendering, ranking, animations, dialogs, sound, API calls. |
| `src/worker.mjs` | `GET /api/leaderboard`, `POST /api/games`, `POST /api/rooms`, the WebSocket route into a room, and the `Room` Durable Object; passes every other request to the static assets. |
| `migrations/` | The D1 schema. `players` is the roster, `games` one row per finished game, `game_players` one row per player per game with total, rank and a last-place flag. |
| `server.mjs` | Static-only server for `Tools/screenshots.mjs`. `wrangler dev` is the real dev server. |
| `wrangler.jsonc` | Assets directory, Worker entry, D1 binding. |
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

## Backend

The Worker is deliberately thin. `POST /api/games` validates the body at the trust boundary
(up to twenty players, names up to 24 characters, finite totals, integer ranks), inserts one
`games` row, then in a single batch upserts each player (so a changed emoji sticks) and inserts
their `game_players` row. `GET /api/leaderboard` is one grouped query: every player with a
count of games, a sum of rank-one finishes, and a sum of last-place flags, ordered by wins.

The page fetches the leaderboard once at load and again after each recorded game. The roster
drives the quick-add chips and the emoji a returning name gets, and the players with at least
one game make up the hall of fame. If the fetch fails (static file, offline), `roster` stays
empty and the page behaves as it did before the backend existed.

A game is posted from `showGameOver()`, guarded by `state.recorded`, which `newGame()` resets.
Changing the target or the win direction resets `seen` and can show the overlay again for the
same game, but not post it twice.

## Live shared board

Tapping Share asks the Worker for a five-letter code, puts it in the URL as `?room=CODE`, and
opens a WebSocket to `/api/rooms/CODE/ws`. The Worker hands that request to the `Room` Durable
Object named by the code, so everyone with the same code lands in the same object.

The room holds one thing: the shared `state` and a version number. A phone that joins receives
the current state, or `null` for a brand-new room, in which case the phone that created it sends
its own board and that becomes the shared one. Every change on any phone goes through
`commit()`, which sends the whole state with the version that phone last saw. The room compares
versions: a match is stored, incremented, and broadcast to every socket; a mismatch means
someone else got there first, so the room sends that phone the current truth instead and the
phone re-renders from it. Whole-state messages are a few kilobytes at most, which is why
there is no operation log.

Receiving a state runs the same `commit()` path with sending switched off, so the rolling
totals, the takeover sheen, and the podium fire on every phone, not only the one that typed.
Dismissing the finish sets `seen` and sends, which closes the overlay everywhere. Recording
to the hall of fame moves into the room when a board is shared: the phone that sees the target
reached sends the results alongside the state, and the room, being single-threaded, writes them
once and marks `recorded` before broadcasting. The room uses the WebSocket hibernation API, so
an idle table costs nothing, and an alarm wipes the room a day after its last change.

The QR code is drawn by `qrcode-generator`, loaded from cdnjs only when the dialog opens. If
that load fails the dialog still shows the code and the link.

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
- **A wrangler.jsonc `account_id` is not the only pin.** The D1 `database_id` is per account too.
  Someone forking the repo has to create their own database and paste the new id, which is why
  the config file carries a comment saying so.
- **A global wrangler shadowed the local one.** `npm run dev` picked up a globally installed
  wrangler 4.22 whose bundled runtime returned 500 on every Durable Object WebSocket upgrade,
  while `npx wrangler deploy` used 4.131. The fix was to add wrangler as a dev dependency so the
  script always runs the current runtime.
- **Two tabs share `localStorage`.** Testing the live board in two tabs of one browser looked
  like it worked before the socket did, because both tabs read the same saved game. The real
  proof is a change appearing in the second tab without a reload.
- **DevTools `/json/list` is not just tabs.** Chrome 152 lists browser UI pages and extension
  service workers before the actual page, and the first entry is never the one you want.
  The screenshot script filters on `type === "page"`.
