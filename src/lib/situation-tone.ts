/** Cores por situação da venda no GestãoClick (nítidas e consistentes). */
export type SituationTone = { dot: string; badge: string };

const RULES: Array<{ test: RegExp; tone: SituationTone }> = [
  {
    test: /(agendad)/i,
    tone: { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-800 border-sky-300" },
  },
  {
    test: /(dispon[ií]vel para entrega)/i,
    tone: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  },
  {
    test: /(dispon[ií]vel para levantamento)/i,
    tone: { dot: "bg-teal-500", badge: "bg-teal-100 text-teal-800 border-teal-300" },
  },
  {
    test: /(dispon[ií]vel)/i,
    tone: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  },
  {
    test: /(entregue|conclu[ií]d|finalizad)/i,
    tone: { dot: "bg-green-600", badge: "bg-green-100 text-green-900 border-green-300" },
  },
  {
    test: /(cancelad|devolvid)/i,
    tone: { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800 border-rose-300" },
  },
  {
    test: /(aguard|pendente|em aberto|reserva)/i,
    tone: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-900 border-amber-300" },
  },
  {
    test: /(produ[cç][aã]o|encomendad|fabrico|transporte|em rota)/i,
    tone: { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  },
];

export function situationTone(situation?: string | null): SituationTone {
  const s = situation ?? "";
  for (const r of RULES) if (r.test.test(s)) return r.tone;
  return { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700 border-slate-300" };
}
