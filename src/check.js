// Asks each address whether it's still breathing.
//
// Three answers, because the web isn't a yes-or-no place:
//   ok       it answered
//   dead     it's gone: 404, 410, or the domain no longer exists
//   unsure   couldn't tell: the site blocks robots (403, 429…), timed out or had a server
//            error. Worth a look by hand, not worth an alarm.

const UA = "Mozilla/5.0 (compatible; still-breathing/1.0; +https://github.com/KanuSaru/still-breathing)";
const DEAD = new Set([404, 410]);
const BLOCKED = new Set([401, 403, 405, 406, 418, 429, 451, 999]);

/**
 * @param {string} url
 * @param {{ timeout?: number, retries?: number, userAgent?: string, fetch?: typeof fetch }} [opts]
 * @returns {Promise<{ url: string, state: "ok" | "dead" | "unsure", status: number | null, detail: string, finalUrl?: string }>}
 */
export async function checkLink(url, opts = {}) {
  const { timeout = 15000, retries = 1, userAgent = UA } = opts;
  const doFetch = opts.fetch ?? fetch;
  const ask = async (method) => {
    const res = await doFetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
      headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en,es;q=0.8" },
    });
    // we only need the status line; don't download the page
    res.body?.cancel?.().catch(() => {});
    return res;
  };

  let last = { url, state: "unsure", status: null, detail: "no answer" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // HEAD is the polite question; plenty of servers answer it wrongly, so anything
      // that isn't a clear yes is asked again with GET
      let res = await ask("HEAD");
      if (!res.ok) res = await ask("GET");
      const status = res.status;
      const moved = res.url && res.url !== url ? { finalUrl: res.url } : {};
      if (res.ok) return { url, state: "ok", status, detail: "ok", ...moved };
      if (DEAD.has(status)) return { url, state: "dead", status, detail: status === 410 ? "gone for good" : "not found", ...moved };
      if (BLOCKED.has(status)) return { url, state: "unsure", status, detail: "the site turns robots away", ...moved };
      last = { url, state: "unsure", status, detail: status >= 500 ? "server error" : `answered ${status}`, ...moved };
    } catch (err) {
      const code = err?.cause?.code || err?.code || "";
      if (code === "ENOTFOUND" || code === "EAI_NONAME") return { url, state: "dead", status: null, detail: "the domain doesn't exist" };
      const slow = err?.name === "TimeoutError" || err?.name === "AbortError";
      last = { url, state: "unsure", status: null, detail: slow ? "timed out" : describe(code, err) };
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return last;
}

function describe(code, err) {
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ECONNRESET") return "connection dropped";
  if (/CERT|SSL|TLS/i.test(code)) return "certificate problem";
  return code ? `network error (${code})` : String(err?.message || "network error");
}

/**
 * Checks many addresses, a few at a time, never more than two at once per site.
 * @param {string[]} urls
 * @param {{ concurrency?: number, perHost?: number, onResult?: (r: object, done: number, total: number) => void } & Parameters<typeof checkLink>[1]} [opts]
 */
export async function checkLinks(urls, opts = {}) {
  const { concurrency = 8, perHost = 2, onResult } = opts;
  const queue = [...new Set(urls)];
  const total = queue.length;
  const results = new Map();
  const busy = new Map(); // host -> requests in flight
  const hostOf = (u) => { try { return new URL(u).host; } catch { return ""; } };
  let done = 0;

  async function worker() {
    for (;;) {
      // the first address whose site isn't already busy
      const i = queue.findIndex((u) => (busy.get(hostOf(u)) ?? 0) < perHost);
      if (i === -1) {
        if (!queue.length) return;
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      const [url] = queue.splice(i, 1);
      const host = hostOf(url);
      busy.set(host, (busy.get(host) ?? 0) + 1);
      const result = await checkLink(url, opts);
      busy.set(host, busy.get(host) - 1);
      results.set(url, result);
      onResult?.(result, ++done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker));
  return urls.filter((u, i) => urls.indexOf(u) === i).map((u) => results.get(u));
}
