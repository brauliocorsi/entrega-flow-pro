/** Matches a Portuguese CP4 against a list of template/route prefixes.
 * Tokens accepted: prefix ("4"), exact CP4 ("4150") or range ("1000-1999"). */
export function zipMatchesPrefixes(
  zip: string | null | undefined,
  prefixes: Array<string | null | undefined> | null | undefined,
): boolean {
  const cp = String(zip ?? "").replace(/\D/g, "").slice(0, 4);
  const prefs = (prefixes ?? []).filter(Boolean).map((p) => String(p));
  if (prefs.length === 0 || !cp) return false;
  const cpNum = Number(cp);
  for (const p of prefs) {
    const m = /^(\d{1,4})-(\d{1,4})$/.exec(p);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (Number.isFinite(cpNum) && cpNum >= Math.min(a, b) && cpNum <= Math.max(a, b)) return true;
      continue;
    }
    if (cp.startsWith(p)) return true;
  }
  const nums = prefs.filter((p) => /^\d{4}$/.test(p)).map(Number);
  if (nums.length >= 2) {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (cpNum >= min && cpNum <= max) return true;
  }
  return false;
}
