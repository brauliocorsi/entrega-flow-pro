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

/** Distrito de Portugal → CP4 representativo (para escolher a taxa). */
export const DISTRITO_TO_CP: Record<string, string> = {
  Aveiro: "3800",
  Beja: "7800",
  Braga: "4700",
  Bragança: "5300",
  "Castelo Branco": "6000",
  Coimbra: "3000",
  Évora: "7000",
  Faro: "8000",
  Guarda: "6300",
  Leiria: "2400",
  Lisboa: "1500",
  Portalegre: "7300",
  Porto: "4100",
  Santarém: "2000",
  Setúbal: "2900",
  "Viana do Castelo": "4900",
  "Vila Real": "5000",
  Viseu: "3500",
};

/** Dado um CP4 e a lista de intervalos, devolve o intervalo vencedor pela mesma regra do suggestDeliveryFee. */
export function pickRangeForZip<T extends { zip_start: string; zip_end: string; priority: number; active: boolean }>(
  zip: string,
  ranges: T[],
): T | null {
  const matches = ranges
    .filter((r) => r.active && r.zip_start <= zip && r.zip_end >= zip)
    .slice()
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const wa = Number(a.zip_end) - Number(a.zip_start);
      const wb = Number(b.zip_end) - Number(b.zip_start);
      return wa - wb;
    });
  return matches[0] ?? null;
}
