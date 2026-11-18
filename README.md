# still-there

Are the links on your site still there?

A small link checker for personal sites, notes and docs. Point it at a built site or a folder of Markdown; it asks every outside link whether it still answers, tells you which ones died and **where each one is**, and can open a GitHub issue for you once a month.

- **No dependencies**, nothing to configure. Node 18 or newer.
- **Honest about what it can't know.** Many sites turn robots away. Those links are reported as "couldn't tell", apart from the ones that are really gone, so one fussy site doesn't cry wolf.
- **Polite.** A few links at a time, never more than two at once on the same site.

## Use it

```bash
npx still-there out/                 # a built site
npx still-there README.md docs/      # files and folders
```

```
Dead (1)
  https://example.com/an-old-page
    404  not found
    in out/notes/index.html:42, out/learn/index.html:310

Couldn't tell (1): check these by hand
  https://www.linkedin.com/in/someone
    999  the site turns robots away
    in out/index.html:88

73 links: 71 ok, 1 dead, 1 unsure.
```

It exits with `1` when something is dead, so it can fail a build or trigger the next step of a workflow.

## The three answers

| | What it means |
| --- | --- |
| **ok** | The address answered, directly or after a redirect |
| **dead** | `404`, `410`, or the domain no longer exists |
| **unsure** | The site blocks robots (`401`, `403`, `429`…), took too long, or had a server error. Open it by hand |

## What it reads

- In **HTML** it reads `href` and `src`, so only real links count, not addresses that happen to sit inside a script.
- In **anything else** (Markdown, text, code) it takes every `http(s)://` address it finds.
- Inside folders it reads `html, htm, md, mdx, markdown, txt`. A file you name directly is always read. `node_modules`, `.git` and hidden folders are skipped.
- Links to `localhost` are left out. The same address found in ten places is checked once and reported with all ten.

It checks links to **other** sites. Links between your own pages aren't checked yet.

## Options

| | |
| --- | --- |
| `--markdown` | A Markdown report with tables, for an issue or a pull request |
| `--json` | Everything as JSON |
| `--ignore <text>` | Skip addresses containing this text. `--ignore /pattern/` takes a regular expression. Repeatable |
| `--ext <a,b,c>` | File types to read inside folders |
| `--timeout <seconds>` | How long to wait for each link. Default 15 |
| `--concurrency <n>` | Links checked at once. Default 8 |
| `--strict` | Also fail when a link couldn't be checked |
| `--local` | Also check links to localhost |
| `--quiet` | No progress while it runs |

## Every month, by itself

`examples/monthly-check.yml` is a GitHub Actions workflow. Copy it to `.github/workflows/links.yml`: on the 1st of each month it builds your site, checks its links, and opens an issue labeled `dead-links` listing what died and where. If that issue is still open the next month, it adds a comment instead of opening another.

## From code

```js
import { collect, checkLinks, markdownReport } from "still-there";

const { links } = collect(["out"], { ignore: ["example.com"] });
const results = await checkLinks([...links.keys()], { onResult: (r, done, total) => console.log(done, total, r.state) });
console.log(markdownReport(results, links));
```

Also exported: `extractLinks(text, { html })`, `checkLink(url)`, `textReport`, `jsonReport` and `summarize`.

## License

MIT, Erick Donado.
