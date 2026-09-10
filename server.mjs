import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 6161;
createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(readFileSync(new URL("./public/index.html", import.meta.url)));
}).listen(PORT, "127.0.0.1", () =>
  console.log(`Score Keeper → http://127.0.0.1:${PORT}`)
);
