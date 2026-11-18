import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { extractLinks, normalize, checkLink, checkLinks, collect, markdownReport, textReport } from "../src/index.js";

let server, base;
const hits = [];
before(async () => {
  server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    const send = (status, headers = {}) => { res.writeHead(status, headers); res.end(req.method === "HEAD" ? undefined : "x"); };
    if (req.url === "/ok") return send(200);
    if (req.url === "/gone") return send(404);
    if (req.url === "/gone-for-good") return send(410);
    if (req.url === "/no-head") return send(req.method === "HEAD" ? 405 : 200);
    if (req.url === "/robots-only") return send(403);
    if (req.url === "/broken") return send(500);
    if (req.url === "/moved") return send(301, { location: "/ok" });
    if (req.url === "/slow") return void setTimeout(() => send(200), 600);
    send(404);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("finds links in HTML attributes only", () => {
  const html = `<a href="https://a.example/x?y=1&amp;z=2">a</a>\n<img src='https://b.example/i.png'>\n<script>var u = "https://not-a-link.example/";</script>\n<a href="/local">l</a><a href=mailto:me@x.y>m</a>`;
  assert.deepEqual(extractLinks(html, { html: true }), [
    { url: "https://a.example/x?y=1&z=2", line: 1 },
    { url: "https://b.example/i.png", line: 2 },
  ]);
});

test("finds links in text and trims what isn't part of them", () => {
  const md = "See [the docs](https://a.example/docs), or https://b.example/page.\nA wiki link: https://en.wikipedia.org/wiki/Neko_(software) and “https://c.example/q?x=1”!";
  assert.deepEqual(
    extractLinks(md).map((l) => l.url),
    ["https://a.example/docs", "https://b.example/page", "https://en.wikipedia.org/wiki/Neko_(software)", "https://c.example/q?x=1”"].map((u) => u.replace("”", "")),
  );
  assert.equal(extractLinks(md)[2].line, 2);
});

test("normalize drops the #fragment and rejects nonsense", () => {
  assert.equal(normalize("https://a.example/page#part"), "https://a.example/page");
  assert.equal(normalize("not a url"), null);
});

test("tells ok, dead and unsure apart", async () => {
  const state = async (p, o) => (await checkLink(base + p, { retries: 0, ...o })).state;
  assert.equal(await state("/ok"), "ok");
  assert.equal(await state("/gone"), "dead");
  assert.equal(await state("/gone-for-good"), "dead");
  assert.equal(await state("/robots-only"), "unsure");
  assert.equal(await state("/broken"), "unsure");
  assert.equal(await state("/slow", { timeout: 100 }), "unsure");
});

test("asks again with GET when HEAD is refused, and follows redirects", async () => {
  const r = await checkLink(base + "/no-head", { retries: 0 });
  assert.equal(r.state, "ok");
  assert.ok(hits.includes("HEAD /no-head") && hits.includes("GET /no-head"));
  const moved = await checkLink(base + "/moved", { retries: 0 });
  assert.equal(moved.state, "ok");
  assert.equal(moved.finalUrl, base + "/ok");
});

test("a domain that doesn't exist is dead", async () => {
  const fake = async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); };
  const r = await checkLink("https://this-domain-is-gone.example/", { fetch: fake });
  assert.equal(r.state, "dead");
});

test("checks a list once each, in the order given", async () => {
  const urls = [base + "/ok", base + "/gone", base + "/ok", base + "/robots-only"];
  let seen = 0;
  const results = await checkLinks(urls, { retries: 0, onResult: () => seen++ });
  assert.deepEqual(results.map((r) => r.state), ["ok", "dead", "unsure"]);
  assert.equal(seen, 3);
});

test("reads folders, remembers where links were, and reports them", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "still-there-"));
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "node_modules", "skip.md"), `${base}/gone`);
  fs.writeFileSync(path.join(dir, "index.html"), `<a href="${base}/ok#top">ok</a>\n<a href="${base}/gone">gone</a>`);
  fs.writeFileSync(path.join(dir, "notes.md"), `first line\n[again](${base}/gone) and http://localhost:3000/dev and ${base}/skip-me`);
  assert.equal(collect([dir]).links.size, 0); // links to your own machine are left out by default
  fs.writeFileSync(path.join(dir, "app.js"), `fetch("${base}/broken")`);
  const { links, files } = collect([dir], { ignore: ["skip-me", "localhost"], local: true });
  assert.equal(files, 2); // .js files aren't read unless asked for
  assert.deepEqual([...links.keys()].sort(), [base + "/gone", base + "/ok"]);
  assert.deepEqual(links.get(base + "/gone").map((p) => `${path.basename(p.file)}:${p.line}`), ["index.html:2", "notes.md:2"]);
  const results = await checkLinks([...links.keys()], { retries: 0 });
  const md = markdownReport(results, links);
  assert.match(md, /2 links checked:\*\* 1 ok, 1 dead, 0 unsure/);
  assert.match(md, /### Dead \(1\)/);
  assert.match(textReport(results, links), /notes\.md:2/);

  // the command line: exit code 1 when something is dead, 0 when it's ignored
  const run = (extra) => new Promise((resolve) => execFile(process.execPath, ["bin/still-there.js", dir, "--quiet", "--local", "--ignore", "localhost", "--ignore", "skip-me", ...extra], (err, stdout) => resolve({ code: err?.code ?? 0, stdout })));
  const bad = await run([]);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /Dead \(1\)/);
  const fine = await run(["--ignore", "/gone"]);
  assert.equal(fine.code, 0);
  fs.rmSync(dir, { recursive: true });
});
