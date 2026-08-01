import * as XLSX from "xlsx";

export type RawMovement = {
  tx_date: string | null;
  amount: number;
  description: string;
  reference: string | null;
  method: string | null;
};

const METHOD_PATTERNS: [RegExp, string][] = [
  [/mb\s*way|mbway/i, "MB Way"],
  [/multibanco|compra\s*mb|pagamento\s*mb|tpa|terminal/i, "Multibanco"],
  [/transfer|trf|sepa|swift/i, "Transferência"],
];

export function inferMethod(text: string): string | null {
  for (const [re, name] of METHOD_PATTERNS) if (re.test(text)) return name;
  return null;
}

function toNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  let s = String(raw ?? "").trim();
  if (!s) return NaN;
  s = s.replace(/[€\s]/g, "");
  // 1.234,56 -> 1234.56 ; 1,234.56 -> 1234.56
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function toDate(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pick(headers: string[], candidates: RegExp[]): number {
  for (const re of candidates) {
    const idx = headers.findIndex((h) => re.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Lê CSV/Excel e devolve movimentos normalizados. */
export function parseTabular(base64: string, fileName: string): RawMovement[] {
  const bytes = base64ToBytes(base64);
  const isCsv = /\.csv$|\.txt$/i.test(fileName);
  const wb = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(bytes), { type: "string", raw: false })
    : XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, raw: false });

  // Encontra a linha de cabeçalho (a primeira que contenha algo semelhante a "valor"/"montante").
  let headerIdx = rows.findIndex((r) =>
    (r ?? []).some((c) => /valor|montante|amount|cr[eé]dito/i.test(String(c ?? ""))),
  );
  if (headerIdx < 0) headerIdx = 0;
  const headers = (rows[headerIdx] ?? []).map((c) => String(c ?? "").trim());

  const iDate = pick(headers, [/data.*valor|data\s*valor/i, /^data/i, /date/i]);
  const iAmount = pick(headers, [/cr[eé]dito/i, /valor/i, /montante/i, /amount/i]);
  const iDesc = pick(headers, [/descri/i, /movimento/i, /hist[oó]rico/i, /description/i]);
  const iRef = pick(headers, [/refer/i, /reference/i, /id\s*transa/i]);

  const out: RawMovement[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.length === 0) continue;
    const amount = toNumber(iAmount >= 0 ? r[iAmount] : undefined);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const description = String((iDesc >= 0 ? r[iDesc] : r.join(" ")) ?? "").trim();
    out.push({
      tx_date: toDate(iDate >= 0 ? r[iDate] : undefined),
      amount: Math.round(Math.abs(amount) * 100) / 100,
      description,
      reference: iRef >= 0 ? String(r[iRef] ?? "").trim() || null : null,
      method: inferMethod(description),
    });
  }
  return out;
}

/** Extrai movimentos de um PDF ou fotografia de extrato usando IA (revisão humana obrigatória). */
export async function parseWithAI(
  base64: string,
  mime: string,
  fileName: string,
): Promise<RawMovement[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY em falta para ler o documento");

  const dataUrl = base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
  const isImage = mime.startsWith("image/");
  const content: any[] = [
    {
      type: "text",
      text:
        "Extrai TODOS os movimentos de entrada (créditos) deste extrato bancário português. " +
        'Responde apenas com JSON: {"movements":[{"date":"YYYY-MM-DD","amount":123.45,"description":"...","reference":"..."}]}. ' +
        "amount sempre positivo, com ponto decimal. Se não houver data, usa null.",
    },
    isImage
      ? { type: "image_url", image_url: { url: dataUrl } }
      : { type: "file", file: { filename: fileName, file_data: dataUrl } },
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite de pedidos de IA atingido. Tenta novamente daqui a pouco.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adiciona créditos para continuar.");
    throw new Error(`Falha ao ler o documento [${res.status}]: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = String(json?.choices?.[0]?.message?.content ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Não foi possível interpretar o documento");
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Resposta da IA inválida ao ler o documento");
  }
  return (parsed?.movements ?? [])
    .map((m: any) => {
      const amount = Math.round(Math.abs(Number(m?.amount ?? 0)) * 100) / 100;
      const description = String(m?.description ?? "").trim();
      return {
        tx_date: toDate(m?.date),
        amount,
        description,
        reference: m?.reference ? String(m.reference).trim() : null,
        method: inferMethod(description),
      } as RawMovement;
    })
    .filter((m: RawMovement) => Number.isFinite(m.amount) && m.amount > 0);
}
