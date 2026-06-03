export type FeeRangeLike = {
  color?: string | null;
  fee: number | string;
};

/** Cor para um intervalo de taxa. Usa color manual se definido, senão gradiente por valor. */
export function getRangeColor(r: FeeRangeLike): string {
  if (r.color && /^#[0-9a-fA-F]{6}$/.test(r.color)) return r.color;
  const fee = Number(r.fee) || 0;
  if (fee <= 0) return "#94a3b8"; // slate-400
  // Gradiente: 0 → verde, 25 → amarelo, 50+ → vermelho
  const t = Math.min(fee / 50, 1);
  // hsl from 130 (verde) → 0 (vermelho)
  const hue = 130 - 130 * t;
  return hslToHex(hue, 70, 50);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export const DISTRITO_TO_CP: Record<string, string> = {
  Aveiro: "3800", Beja: "7800", Braga: "4700", Bragança: "5300",
  "Castelo Branco": "6000", Coimbra: "3000", Évora: "7000", Faro: "8000",
  Guarda: "6300", Leiria: "2400", Lisboa: "1500", Portalegre: "7300",
  Porto: "4100", Santarém: "2000", Setúbal: "2900",
  "Viana do Castelo": "4900", "Vila Real": "5000", Viseu: "3500",
};

/** Faixa CP4 [início, fim] aproximada de cada distrito, alinhada com as macro zonas semeadas. */
export const DISTRITO_TO_CP_RANGE: Record<string, [string, string]> = {
  Aveiro: ["3500", "3999"], Beja: ["7500", "7999"], Braga: ["4500", "4999"],
  Bragança: ["5500", "5999"], "Castelo Branco": ["6000", "6499"],
  Coimbra: ["3000", "3499"], Évora: ["7000", "7499"], Faro: ["8000", "8999"],
  Guarda: ["6500", "6999"], Leiria: ["2400", "2499"], Lisboa: ["1000", "1999"],
  Portalegre: ["7300", "7399"], Porto: ["4000", "4499"],
  Santarém: ["2000", "2499"], Setúbal: ["2500", "2999"],
  "Viana do Castelo": ["4900", "4999"], "Vila Real": ["5000", "5499"],
  Viseu: ["3500", "3999"],
};

export function pickRangeForZip<T extends { zip_start: string; zip_end: string; priority: number; active: boolean }>(
  zip: string, ranges: T[],
): T | null {
  const matches = ranges
    .filter((r) => r.active && r.zip_start <= zip && r.zip_end >= zip)
    .slice()
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (Number(a.zip_end) - Number(a.zip_start)) - (Number(b.zip_end) - Number(b.zip_start));
    });
  return matches[0] ?? null;
}

/** Devolve todas as ranges activas que intersectam a faixa CP do distrito, ordenadas por prioridade (menor primeiro) e largura (menor primeiro). */
export function pickRangesForDistrict<T extends { zip_start: string; zip_end: string; priority: number; active: boolean }>(
  distrito: string, ranges: T[],
): T[] {
  const span = DISTRITO_TO_CP_RANGE[distrito];
  if (!span) return [];
  const [a, b] = span;
  return ranges
    .filter((r) => r.active && r.zip_start <= b && r.zip_end >= a)
    .slice()
    .sort((x, y) => {
      if (x.priority !== y.priority) return x.priority - y.priority;
      return (Number(x.zip_end) - Number(x.zip_start)) - (Number(y.zip_end) - Number(y.zip_start));
    });
}

/** Resolve a cor de uma range. Se não tiver cor manual e for sub-zona (priority < 5), herda da macro (priority 5) que a contém. Caso contrário, cai no gradiente por valor. */
export function resolveRangeColor<T extends { zip_start: string; zip_end: string; priority: number; active: boolean; color?: string | null; fee: number | string }>(
  r: T,
  all: T[],
): string {
  if (r.color && /^#[0-9a-fA-F]{6}$/.test(r.color)) return r.color;
  if (r.priority < 5) {
    const parent = all.find(
      (m) => m.priority === 5 && m.active && m.zip_start <= r.zip_start && m.zip_end >= r.zip_end,
    );
    if (parent) return getRangeColor(parent);
  }
  return getRangeColor(r);
}
