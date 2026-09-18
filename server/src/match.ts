export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\b(feat|ft|featuring)\.?\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

export function isCloseMatch(guess: string, actual: string): boolean {
  const g = normalizeText(guess);
  const a = normalizeText(actual);
  if (!g || !a) return false;
  if (g === a) return true;
  if (a.startsWith(g) && g.length >= Math.max(4, Math.floor(a.length * 0.65))) {
    return true;
  }
  if (g.includes(a) && a.length >= 4) return true;
  if (a.includes(g) && g.length >= Math.max(4, Math.floor(a.length * 0.7))) {
    return true;
  }
  const dist = levenshtein(g, a);
  const max = Math.max(1, Math.floor(a.length * 0.22));
  return dist <= max;
}

export function matchesSong(titleGuess: string, title: string): boolean {
  return isCloseMatch(titleGuess, title);
}
