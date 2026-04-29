// One prompt, used verbatim by every provider. Models reply with a JSON object
// shaped { suggestions: [{ original, replacement, type, explanation }] }.
// `original` must be a literal substring of the input so the aggregator can
// resolve it back to a span.

export const SYSTEM = `You are a meticulous proofreader. Find grammar, spelling,
punctuation and clarity issues in the user's text. For each issue, return the
shortest substring of the original text that needs to change ("original"), what
to replace it with ("replacement"), a one-word "type" (grammar | spelling |
punctuation | clarity | style) and a brief "explanation". The "original" field
MUST be an exact substring of the input. Reply with strict JSON only:
{"suggestions":[{"original":"...","replacement":"...","type":"...","explanation":"..."}]}.
If the text is already correct, return {"suggestions":[]}.`;

export function buildUser(text) {
  return `Proofread this text and reply with strict JSON:\n\n${text}`;
}

// Best-effort JSON extraction — some models wrap the output in prose or fences.
export function parseJson(raw) {
  if (!raw) return { suggestions: [] };
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return { suggestions: [] };
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1));
    return { suggestions: Array.isArray(obj.suggestions) ? obj.suggestions : [] };
  } catch {
    return { suggestions: [] };
  }
}
