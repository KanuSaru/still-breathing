// Collects links from files and folders, remembering where each one was found.

import fs from "node:fs";
import path from "node:path";
import { extractLinks, normalize } from "./extract.js";

export const DEFAULT_EXTENSIONS = ["html", "htm", "md", "mdx", "markdown", "txt"];
const SKIP = new Set(["node_modules", ".git", ".next", ".cache"]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/**
 * @param {string[]} targets files or folders. A file named directly is always read; inside folders only `extensions` are.
 * @param {{ extensions?: string[], ignore?: (string | RegExp)[], local?: boolean }} [opts] local: also keep links to localhost
 * @returns {{ links: Map<string, { file: string, line: number }[]>, files: number }} address (without #fragment) -> where it appears
 */
export function collect(targets, opts = {}) {
  const exts = new Set((opts.extensions ?? DEFAULT_EXTENSIONS).map((e) => e.replace(/^\./, "").toLowerCase()));
  const ignore = opts.ignore ?? [];
  const skip = (url) => ignore.some((p) => (p instanceof RegExp ? p.test(url) : url.includes(p)));
  const links = new Map();
  let files = 0;
  const read = (file) => {
    const ext = path.extname(file).slice(1).toLowerCase();
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      return;
    }
    files++;
    for (const { url, line } of extractLinks(text, { html: ext === "html" || ext === "htm" })) {
      const key = normalize(url);
      if (!key || skip(key)) continue;
      // links to your own machine only work on your machine
      if (!opts.local && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(key)) continue;
      if (!links.has(key)) links.set(key, []);
      const places = links.get(key);
      if (!places.some((p) => p.file === file && p.line === line)) places.push({ file, line });
    }
  };
  for (const target of targets) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const file of walk(target)) if (exts.has(path.extname(file).slice(1).toLowerCase())) read(file);
    } else read(target);
  }
  return { links, files };
}
