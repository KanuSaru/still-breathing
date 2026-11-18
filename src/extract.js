// Finds the links in a piece of text.
//
// In HTML it reads href and src attributes, so only real links count (not URLs that
// happen to appear in a script). In anything else (Markdown, plain text, code) it takes
// every http(s) address it sees.

const ATTR = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const BARE = /https?:\/\/[^\s<>"'`\\^{}|“”‘’«»]+/g;

const entities = (s) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/g, '"');

/** Drops what usually isn't part of the address: closing punctuation, an unmatched bracket. */
function trim(url) {
  let u = url;
  for (;;) {
    const last = u[u.length - 1];
    if (".,;:!?'\"*_~".includes(last)) u = u.slice(0, -1);
    else if (last === ")" && count(u, "(") < count(u, ")")) u = u.slice(0, -1);
    else if (last === "]" && count(u, "[") < count(u, "]")) u = u.slice(0, -1);
    else break;
  }
  return u;
}
const count = (s, ch) => s.split(ch).length - 1;

/**
 * @param {string} text
 * @param {{ html?: boolean }} [opts] html: true reads attributes only
 * @returns {{ url: string, line: number }[]} in order, with the line each was found on
 */
export function extractLinks(text, opts = {}) {
  const out = [];
  const lineAt = lineCounter(text);
  if (opts.html) {
    for (const m of text.matchAll(ATTR)) {
      const raw = entities((m[1] ?? m[2] ?? m[3] ?? "").trim());
      if (/^https?:\/\//i.test(raw)) out.push({ url: raw, line: lineAt(m.index) });
    }
  } else {
    for (const m of text.matchAll(BARE)) {
      const url = trim(m[0]);
      if (url.length > 10) out.push({ url, line: lineAt(m.index) });
    }
  }
  return out;
}

function lineCounter(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** The address without its #fragment, which never reaches the server. */
export function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
