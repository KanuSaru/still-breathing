#!/usr/bin/env node
// still-breathing: are the links on your site still breathing?
//
//   npx still-breathing out/                    every link in a built site
//   npx still-breathing README.md docs/         files and folders
//   npx still-breathing out --markdown > report.md
//
// Exit code: 0 nothing dead, 1 something dead, 2 it couldn't run.

import { collect, checkLinks, textReport, markdownReport, jsonReport, summarize, DEFAULT_EXTENSIONS } from "../src/index.js";

const HELP = `Usage: still-breathing <file or folder>... [options]

  --markdown            print a Markdown report (for an issue or a pull request)
  --json                print JSON
  --ignore <text>       skip addresses containing this text; /like this/ is a pattern. Repeatable
  --ext <a,b,c>         file types to read inside folders (default: ${DEFAULT_EXTENSIONS.join(",")})
  --timeout <seconds>   how long to wait for each link (default 15)
  --concurrency <n>     links checked at once (default 8)
  --strict              also fail when a link couldn't be checked
  --local               also check links to localhost
  --quiet               no progress while it runs
  -h, --help
`;

const args = process.argv.slice(2);
const targets = [];
const o = { ignore: [], format: "text", timeout: 15, concurrency: 8, strict: false, quiet: false, ext: null, local: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const value = () => {
    const v = args[++i];
    if (v === undefined) fail(`${a} needs a value`);
    return v;
  };
  if (a === "-h" || a === "--help") { process.stdout.write(HELP); process.exit(0); }
  else if (a === "--markdown") o.format = "markdown";
  else if (a === "--json") o.format = "json";
  else if (a === "--strict") o.strict = true;
  else if (a === "--quiet") o.quiet = true;
  else if (a === "--local") o.local = true;
  else if (a === "--ignore") {
    const v = value();
    const m = v.match(/^\/(.+)\/([a-z]*)$/);
    o.ignore.push(m ? new RegExp(m[1], m[2]) : v);
  } else if (a === "--ext") o.ext = value().split(",").map((s) => s.trim()).filter(Boolean);
  else if (a === "--timeout") o.timeout = Number(value());
  else if (a === "--concurrency") o.concurrency = Number(value());
  else if (a.startsWith("-")) fail(`unknown option ${a}`);
  else targets.push(a);
}
if (!targets.length) { process.stderr.write(HELP); process.exit(2); }
if (!(o.timeout > 0) || !(o.concurrency > 0)) fail("--timeout and --concurrency need a number above zero");

function fail(message) {
  process.stderr.write(`still-breathing: ${message}\n`);
  process.exit(2);
}

let found;
try {
  found = collect(targets, { extensions: o.ext ?? undefined, ignore: o.ignore, local: o.local });
} catch (err) {
  fail(err.code === "ENOENT" ? `can't find ${err.path}` : err.message);
}
const urls = [...found.links.keys()];
const progress = !o.quiet && process.stderr.isTTY;
if (!o.quiet) process.stderr.write(`still-breathing: ${urls.length} links in ${found.files} files\n`);

const results = await checkLinks(urls, {
  timeout: o.timeout * 1000,
  concurrency: o.concurrency,
  onResult: (r, done, total) => {
    if (progress) process.stderr.write(`\r  ${done}/${total}`);
  },
});
if (progress) process.stderr.write("\r" + " ".repeat(20) + "\r");

const report = o.format === "markdown" ? markdownReport : o.format === "json" ? jsonReport : textReport;
process.stdout.write(report(results, found.links) + "\n");
const { dead, unsure } = summarize(results);
process.exit(dead.length || (o.strict && unsure.length) ? 1 : 0);
