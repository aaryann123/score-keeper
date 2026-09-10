// JSON endpoints and live rooms in front of the static page. Everything else is served from public/.
//   GET  /api/leaderboard        -> all-time roster with games, wins, last places
//   POST /api/games              -> record a finished game { target, lowWins, results: [{ name, emoji, total, rank }] }
//   POST /api/rooms              -> { code } for a new shared board
//   GET  /api/rooms/:code/ws     -> WebSocket into that board's Durable Object

import { DurableObject } from "cloudflare:workers";

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to misread from a screen

function validResults(results) {
  return Array.isArray(results) && results.length > 0 && results.length <= 20
    && results.every((r) => typeof r.name === "string" && r.name.trim() && r.name.length <= 24
      && typeof r.emoji === "string" && r.emoji.length <= 8 && Number.isFinite(r.total) && Number.isInteger(r.rank));
}

async function recordGame(db, { target, lowWins, results }) {
  const now = Date.now();
  const lastRank = Math.max(...results.map((r) => r.rank));
  const { meta } = await db.prepare("INSERT INTO games (finished_at, target, low_wins) VALUES (?, ?, ?)")
    .bind(now, target, lowWins ? 1 : 0).run();
  await db.batch(results.flatMap((r) => [
    db.prepare("INSERT INTO players (name, emoji, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET emoji = excluded.emoji")
      .bind(r.name.trim(), r.emoji, now),
    db.prepare("INSERT INTO game_players (game_id, name, total, rank, is_last) VALUES (?, ?, ?, ?, ?)")
      .bind(meta.last_row_id, r.name.trim(), r.total, r.rank, r.rank === lastRank && lastRank > 1 ? 1 : 0),
  ]));
  return meta.last_row_id;
}

// One Room per shared board. Holds the authoritative game state and fans out every change to
// every connected phone. Uses the hibernation API so idle rooms cost nothing.
export class Room extends DurableObject {
  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const [state, version] = await Promise.all([this.ctx.storage.get("state"), this.ctx.storage.get("version")]);
    pair[1].send(JSON.stringify({ type: "state", state: state ?? null, version: version ?? 0 }));
    this.presence();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== "state" || !msg.state || typeof msg.state !== "object") return;
    const version = (await this.ctx.storage.get("version")) ?? 0;
    if (msg.version !== version) {
      // Stale edit: hand back the current truth instead of clobbering someone else's entry
      ws.send(JSON.stringify({ type: "state", state: await this.ctx.storage.get("state"), version, stale: true }));
      return;
    }
    const state = msg.state;
    // The room, not any one phone, writes a finished game to the hall of fame exactly once
    if (msg.finished && !state.recorded && validResults(msg.finished) && Number.isFinite(state.target)) {
      state.recorded = true;
      try { await recordGame(this.env.DB, { target: state.target, lowWins: state.lowWins, results: msg.finished }); } catch {}
    }
    const next = version + 1;
    await this.ctx.storage.put({ state, version: next });
    await this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000); // forget the room a day after its last change
    const out = JSON.stringify({ type: "state", state, version: next });
    this.ctx.getWebSockets().forEach((s) => { try { s.send(out); } catch {} });
  }

  webSocketClose(ws) { try { ws.close(); } catch {} this.presence(ws); }
  webSocketError(ws) { try { ws.close(); } catch {} this.presence(ws); }

  // The socket being closed is still listed while its close handler runs, so leave it out
  presence(closing) {
    const sockets = this.ctx.getWebSockets().filter((s) => s !== closing);
    const out = JSON.stringify({ type: "presence", n: sockets.length });
    sockets.forEach((s) => { try { s.send(out); } catch {} });
  }

  async alarm() { await this.ctx.storage.deleteAll(); }
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);

    if (pathname === "/api/leaderboard") {
      const { results } = await env.DB.prepare(`
        SELECT p.name, p.emoji,
               COUNT(gp.game_id)            AS games,
               COALESCE(SUM(gp.rank = 1), 0) AS wins,
               COALESCE(SUM(gp.is_last), 0)  AS lasts
        FROM players p LEFT JOIN game_players gp ON gp.name = p.name
        GROUP BY p.name ORDER BY wins DESC, games ASC, p.created_at ASC`).all();
      return json(results);
    }

    if (pathname === "/api/games" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !validResults(body.results) || !Number.isFinite(body.target)) {
        return json({ error: "Expected { target, lowWins, results: [{ name, emoji, total, rank }] }" }, 400);
      }
      return json({ id: await recordGame(env.DB, body) }, 201);
    }

    if (pathname === "/api/rooms" && req.method === "POST") {
      const bytes = crypto.getRandomValues(new Uint8Array(5));
      const code = [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
      return json({ code }, 201);
    }

    const room = pathname.match(/^\/api\/rooms\/([A-Z2-9]{5})\/ws$/);
    if (room) return env.ROOM.getByName(room[1]).fetch(req);

    if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(req);
  },
};
