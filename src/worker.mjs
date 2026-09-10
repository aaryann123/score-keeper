// Two JSON endpoints in front of the static page. Everything else is served from public/.
//   GET  /api/leaderboard  -> all-time roster with games, wins, last places
//   POST /api/games        -> record a finished game { target, lowWins, results: [{ name, emoji, total, rank }] }

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

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
      const ok = body && Array.isArray(body.results) && body.results.length > 0 && body.results.length <= 20
        && body.results.every((r) => typeof r.name === "string" && r.name.trim() && r.name.length <= 24
          && typeof r.emoji === "string" && r.emoji.length <= 8 && Number.isFinite(r.total) && Number.isInteger(r.rank))
        && Number.isFinite(body.target);
      if (!ok) return json({ error: "Expected { target, lowWins, results: [{ name, emoji, total, rank }] }" }, 400);

      const now = Date.now();
      const lastRank = Math.max(...body.results.map((r) => r.rank));
      const { meta } = await env.DB.prepare("INSERT INTO games (finished_at, target, low_wins) VALUES (?, ?, ?)")
        .bind(now, body.target, body.lowWins ? 1 : 0).run();
      const gameId = meta.last_row_id;
      await env.DB.batch(body.results.flatMap((r) => [
        env.DB.prepare("INSERT INTO players (name, emoji, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET emoji = excluded.emoji")
          .bind(r.name.trim(), r.emoji, now),
        env.DB.prepare("INSERT INTO game_players (game_id, name, total, rank, is_last) VALUES (?, ?, ?, ?, ?)")
          .bind(gameId, r.name.trim(), r.total, r.rank, r.rank === lastRank && lastRank > 1 ? 1 : 0),
      ]));
      return json({ id: gameId }, 201);
    }

    if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(req);
  },
};
