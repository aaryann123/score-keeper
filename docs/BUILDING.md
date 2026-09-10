# Building and extending

## Requirements

| | |
|---|---|
| Node | 18 or newer. `npm install` pulls in wrangler, the only dependency. |
| Browser | Any current one. The app uses `<dialog>`, the Web Animations API, and `localStorage`. |
| Cloudflare | A free account to host it. Local development needs no account. |
| Screenshots | Google Chrome at its default macOS path, and `sips`. Set `CHROME=/path/to/chrome` to override. |

## First run

```bash
git clone https://github.com/aaryann123/score-keeper.git
cd score-keeper
npm install                # wrangler
npm run db:migrate:local   # creates the local SQLite file under .wrangler/
npm run dev                # http://127.0.0.1:6161, Worker + page + rooms + local D1
```

Use the local `wrangler` from `node_modules`, not a global one. An older global wrangler runs an
older local runtime that cannot complete the Durable Object WebSocket handshake; the symptom is
a 500 on `/api/rooms/<code>/ws` and a "did not return status 101" error in the log.

`npm run dev:static` serves only `public/index.html` through `server.mjs` on 6161 (or `$PORT`),
with no API; the page falls back to the placeholder chips and keeps no history.

## Loading a demo game

```bash
node Tools/demo-state.mjs longgame     # also: empty, midgame, hearts, nearend
```

Paste the output into the browser console, then reload:

```js
localStorage.setItem("score-keeper", JSON.stringify(<paste the output here>)); location.reload();
```

## Layout

```
public/index.html       the page; CSS in <style>, markup, then the script
src/worker.mjs          API routes, the Room Durable Object, everything else from public/
migrations/0001_init.sql players, games, game_players
server.mjs              static-only dev server, used by Tools/screenshots.mjs
wrangler.jsonc          assets + Worker + D1 binding + Room Durable Object
package.json            scripts: dev, dev:static, deploy, db:migrate, db:migrate:local
Tools/demo-state.mjs    synthetic states: empty, midgame, longgame, hearts, nearend
Tools/screenshots.mjs   screenshot generator
docs/ARCHITECTURE.md    how it works and what went wrong on the way
docs/BUILDING.md        this file
docs/screenshots/       generated PNGs used by the README
```

## Deploying

```bash
npx wrangler login                    # opens the browser; pick the account to deploy into
npx wrangler d1 create score-keeper   # prints a database_id
# paste that id into wrangler.jsonc, then:
npm run db:migrate                    # applies migrations/ to the remote database
npm run deploy                        # prints the workers.dev URL
```

The config does not pin an `account_id`; wrangler uses whichever account you logged into. Add
`"account_id": "..."` to `wrangler.jsonc` if you have several and want deploys to always go to
one of them.

To pre-load the hall of fame with your regulars so their chips appear before any game is
recorded:

```bash
npx wrangler d1 execute score-keeper --remote --command \
  "INSERT OR IGNORE INTO players (name, emoji, created_at) VALUES ('Sam','🚀',1),('Mia','🦋',2)"
```

**Loser sound.** Put an audio file at `public/loser.m4a`. It is git-ignored; when it is missing the
page falls back to the browser's speech engine.

## Adding things

**A suggested name.** Edit `SUGGESTED` near the top of the script:

```js
const SUGGESTED = { Alex: "🦁", Priya: "🌸", Sam: "🚀", Mia: "🦋", Kai: "⚡" };
```

A chip appears for each entry that is not already on the board.

**An emoji.** Add it to the `EMOJI` array. Tapping an avatar cycles through that array in order.

**A colour or radius.** The tokens live in `:root` at the top of the `<style>` block. `--accent`
is the amber used for the leader, the primary button, and the wordmark.

**A new confirm.** Call `ask(title, message, actionLabel, danger)`; it returns a promise that
resolves `true` when the action button is chosen.

**A change to what the room shares.** The whole `state` object minus `room` is sent on every
change and stored as-is in the Durable Object. Add a field to the client-side `state` default
and to `applyRemote()`, and it flows through. Nothing in the room needs to know about it.

**A schema change.** Add `migrations/000N_<name>.sql`; `npm run db:migrate:local` and
`npm run db:migrate` apply whatever has not run yet.

**A new setting.** Add a field to the `state` object's default, a control in the `.rules` row,
and a handler that sets the field, resets `seen` if the setting can change who has won, and
calls `commit()`.

## Regenerating the screenshots

```bash
node Tools/screenshots.mjs
```

The script starts the dev server on port 6199, launches headless Chrome with remote debugging on
9333, loads each state from `Tools/demo-state.mjs` into `localStorage`, reloads, waits for fonts,
runs an optional in-page action (the game-over shot submits a score through the real form so the
overlay and confetti fire), captures at 2x, and downscales to 1600 px wide with `sips`. Add a shot
by appending to the `SHOTS` array; add a state by adding to `states` in `demo-state.mjs`. A shot
can set `room` to draw the share dialog against the static server; the socket fails quietly.

Open every PNG afterwards. Fonts still loading or an overlay caught mid-fade get past the script
and not past a look.

## Not supported yet

- Two phones editing the same player in the same second. The second edit is rejected and that
  phone's board snaps back to the shared truth, so the score has to be entered again.
- Firefox before version 98 and Safari before 15.4 lack `<dialog>`; confirmations will not open.
- The screenshot tool assumes macOS for `sips`. On Linux, swap the downscale for ImageMagick's
  `convert -resize 1600x`.
