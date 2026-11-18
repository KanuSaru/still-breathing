// Turns results into something to read: plain text for a terminal, Markdown for an issue, or JSON.

const where = (places, max = 3) => {
  const shown = places.slice(0, max).map((p) => `${p.file}:${p.line}`);
  return shown.join(", ") + (places.length > max ? ` and ${places.length - max} more` : "");
};

export function summarize(results) {
  const by = { ok: [], dead: [], unsure: [] };
  for (const r of results) by[r.state].push(r);
  return by;
}

export function textReport(results, links) {
  const { ok, dead, unsure } = summarize(results);
  const lines = [];
  const block = (title, list) => {
    if (!list.length) return;
    lines.push("", title);
    for (const r of list) {
      lines.push(`  ${r.url}`);
      lines.push(`    ${r.status ?? "—"}  ${r.detail}${r.finalUrl ? `  (ends at ${r.finalUrl})` : ""}`);
      const places = links?.get(r.url);
      if (places?.length) lines.push(`    in ${where(places)}`);
    }
  };
  block(`Dead (${dead.length})`, dead);
  block(`Couldn't tell (${unsure.length}): check these by hand`, unsure);
  lines.push("", `${results.length} links: ${ok.length} ok, ${dead.length} dead, ${unsure.length} unsure.`);
  return lines.join("\n").replace(/^\n/, "");
}

export function markdownReport(results, links) {
  const { ok, dead, unsure } = summarize(results);
  const out = [`**${results.length} links checked:** ${ok.length} ok, ${dead.length} dead, ${unsure.length} unsure.`];
  const table = (title, note, list) => {
    if (!list.length) return;
    out.push("", `### ${title}`, "", note, "", "| Link | Answer | Found in |", "| --- | --- | --- |");
    for (const r of list) {
      const places = links?.get(r.url) ?? [];
      out.push(`| ${r.url} | ${r.status ?? "—"} ${r.detail} | ${places.length ? where(places).replace(/\|/g, "\\|") : ""} |`);
    }
  };
  table(`Dead (${dead.length})`, "These are gone. Replace or remove them.", dead);
  table(`Couldn't tell (${unsure.length})`, "These sites turned the check away or were slow. Open them by hand.", unsure);
  return out.join("\n");
}

export function jsonReport(results, links) {
  return JSON.stringify(
    results.map((r) => ({ ...r, places: links?.get(r.url) ?? [] })),
    null,
    2,
  );
}
