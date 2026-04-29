// Resolve each suggestion's `original` substring back to a [start, end) span,
// then cluster overlapping spans across providers. A cluster's confidence is
// the share of providers that flagged it; the chosen replacement is the most
// common one (ties broken by alphabetical order for determinism).

function resolveSpan(text, original, cursor = 0) {
  if (!original) return null;
  const idx = text.indexOf(original, cursor);
  if (idx === -1) return null;
  return { start: idx, end: idx + original.length };
}

function spansOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestN = -1;
  for (const [v, n] of [...counts.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}

export function aggregate(text, perModel) {
  const flagged = [];
  for (const { name, suggestions } of perModel) {
    let cursor = 0;
    for (const s of suggestions) {
      const span = resolveSpan(text, s.original, cursor);
      if (!span) continue;
      cursor = span.start;
      flagged.push({
        model: name,
        ...span,
        original: s.original,
        replacement: s.replacement || "",
        type: (s.type || "grammar").toLowerCase(),
        explanation: s.explanation || "",
      });
    }
  }

  // Greedy clustering by overlap.
  flagged.sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters = [];
  for (const f of flagged) {
    const c = clusters.find((c) => spansOverlap(c, f));
    if (c) {
      c.start = Math.min(c.start, f.start);
      c.end = Math.max(c.end, f.end);
      c.members.push(f);
    } else {
      clusters.push({ start: f.start, end: f.end, members: [f] });
    }
  }

  const totalModels = perModel.length || 1;
  return clusters.map((c) => {
    const replacements = c.members.map((m) => m.replacement);
    const types = c.members.map((m) => m.type);
    const agreed = new Set(c.members.map((m) => m.model)).size;
    return {
      start: c.start,
      end: c.end,
      original: text.slice(c.start, c.end),
      replacement: mode(replacements),
      type: mode(types),
      explanation: c.members[0].explanation,
      confidence: Number((agreed / totalModels).toFixed(2)),
      agreed_by: agreed,
    };
  });
}
