/**
 * Whitespace rule JSX applies to text children: lines are trimmed (except the outer edges of the
 * first and last line), whitespace-only lines are dropped and the rest is joined with one space.
 * This is the text React renders, so it is the default text the site shows.
 */
export function normalizeJsxText(raw: string): string {
  const lines = raw.split(/\r\n|\r|\n/);
  const kept: string[] = [];
  lines.forEach((line, index) => {
    let value = line.replace(/\t/g, " ");
    if (index > 0) value = value.replace(/^[ ]+/, "");
    if (index < lines.length - 1) value = value.replace(/[ ]+$/, "");
    if (value) kept.push(value);
  });
  return kept.join(" ");
}
