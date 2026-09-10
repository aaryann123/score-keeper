// Regenerates docs/screenshots/*.png from the synthetic states in demo-state.mjs.
//
//   node Tools/screenshots.mjs
//
// Needs Google Chrome and macOS `sips` (for the downscale). Starts the dev server on a spare
// port, drives headless Chrome over the DevTools protocol with Node's built-in WebSocket,
// captures at 2x, and downscales each PNG to 1600 px wide. No third-party packages.

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { states } from "./demo-state.mjs";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 6199, CDP = 9333;
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const URL_ = `http://127.0.0.1:${PORT}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Each shot: which state to load, the viewport, and an optional action to run in the page first
const SHOTS = [
  { file: "empty", state: "empty", size: [1280, 860] },
  { file: "board", state: "midgame", size: [1280, 860] },
  { file: "lowest-wins", state: "hearts", size: [1280, 860] },
  { file: "history", state: "longgame", size: [1280, 900] },
  {
    file: "game-over", state: "nearend", size: [1280, 860],
    // push the leader past the target through the real form so the overlay and confetti fire
    action: `const i = document.querySelector('.player .entry input'); i.value = '60'; i.form.requestSubmit();`,
  },
  { file: "mobile", state: "midgame", size: [390, 844], mobile: true },
];

mkdirSync(OUT, { recursive: true });
const server = spawn("node", [new URL("../server.mjs", import.meta.url).pathname], { env: { ...process.env, PORT } });
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${CDP}`, "--hide-scrollbars", "--no-first-run", "--disable-extensions",
  "--user-data-dir=/tmp/score-keeper-shots", "about:blank",
], { stdio: "ignore" });

try {
  await wait(1200);
  const targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const { webSocketDebuggerUrl } = targets.find((t) => t.type === "page"); // not the browser UI targets
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const loaded = { resolve: null };
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === "Page.loadEventFired") loaded.resolve?.();
  };
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = (expression) => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const navigate = async () => { const p = new Promise((r) => (loaded.resolve = r)); await send("Page.navigate", { url: URL_ }); await p; };

  await send("Page.enable");
  await navigate(); // establish the origin so localStorage is reachable

  for (const s of SHOTS) {
    await send("Emulation.setDeviceMetricsOverride", { width: s.size[0], height: s.size[1], deviceScaleFactor: 2, mobile: !!s.mobile });
    await evaluate(`localStorage.setItem("score-keeper", ${JSON.stringify(JSON.stringify(states[s.state]))})`);
    await navigate();
    await evaluate(`document.fonts.ready.then(() => new Promise(r => setTimeout(r, 200)))`);
    if (s.action) { await evaluate(s.action); await wait(1400); }
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const path = `${OUT}${s.file}.png`;
    writeFileSync(path, Buffer.from(data, "base64"));
    execFileSync("sips", ["-Z", s.mobile ? "780" : "1600", path], { stdio: "ignore" });
    console.log("wrote", path);
  }
  ws.close();
} finally {
  chrome.kill();
  server.kill();
}
