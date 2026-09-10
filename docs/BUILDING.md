# Building and extending

## Requirements

| | |
|---|---|
| Node | 18 or newer. `npx wrangler` is fetched on first use; nothing to `npm install`. |
| Browser | Any current one. The app uses `<dialog>`, the Web Animations API, and `localStorage`. |
| Cloudflare | A free account to host it. Local development needs no account. |
| Screenshots | Google Chrome at its default macOS path, and `sips`. Set `CHROME=/path/to/chrome` to override. |

## First run

```bash
git clone https://github.com/aaryann123/score-keeper.git
cd score-keeper
npm run db:migrate:local   # creates the local SQLite file under .wrangler/
npm run dev                # http://127.0.0.1:6161, Worker + page + local D1
```

`npm run dev:static` serves only `public/index.html` through `server.mjs` on 6161 (or `$PORT`),
with no API; the page falls back to the placeholder chips and keeps no history.

## Layout

```
public/index.html       the page; CSS in <style>, markup, then the script
src/worker.mjs          GET /api/leaderboard, POST /api/games; everything else from public/
migrations/0001_init.sql players, games, game_players
server.mjs              static-only dev server, used by Tools/screenshots.mjs
wrangler.jsonc          assets + Worker + D1 binding
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

**Loser sound.** Put an MP3 at `public/loser.mp3`. It is git-ignored; when it is missing the
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
by appending to the `SHOTS` array; add a state by adding to `states` in `demo-state.mjs`.

Open every PNG afterwards. Fonts still loading or an overlay caught mid-fade get past the script
and not past a look.

## Not supported yet

- Sharing one live board between several phones. The current game is per browser; only finished
  games reach the database.
- Firefox before version 98 and Safari before 15.4 lack `<dialog>`; confirmations will not open.
- The screenshot tool assumes macOS for `sips`. On Linux, swap the downscale for ImageMagick's
  `convert -resize 1600x`.
