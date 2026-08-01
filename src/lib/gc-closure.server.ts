/**
 * Sincronização do fecho de rota com o GestãoClick.
 * Server-only: usa credenciais em process.env.
 */

export type ClosureOutcome = "entregue" | "entregue_parcial" | "reagendado" | "cancelado";

export const CLOSURE_SITUACAO_LABEL: Record<ClosureOutcome, string> = {
  entregue: "Produto Entregue",
  entregue_parcial: "Entrega Parcial",
  reagendado: "Reagendada",
  cancelado: "Cancelada",
};

function creds() {
  const baseUrl = process.env["GESTAOCLICK_BASE_URL"];
  const apiKey = process.env["GESTAOCLICK_API_KEY"];
  const email = process.env["GESTAOCLICK_EMAIL"];
  if (!baseUrl || !apiKey || !email) throw new Error("Credenciais GestãoClick em falta");
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  let base = trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/$/, "");
    base =
      host === "gestaoclick.com" ||
      host === "www.gestaoclick.com" ||
      path === "/integracao_api/inicio" ||
      path === "/integracao_api/login"
        ? "https://api.gestaoclick.com"
        : `${url.origin}${path}`;
  } catch {
    base = trimmed;
  }
  return {
    base,
    headers: {
      "access-token": apiKey,
      "secret-access-token": email,
      Accept: "application/json",
      "Content-Type": "application/json",
    } as Record<string, string>,
  };
}

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok && res.status !== 404) {
    throw new Error(`GestãoClick ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error("GestãoClick devolveu resposta inválida (não-JSON)");
  }
}

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function resolveSituacaoId(label: string): Promise<string | null> {
  try {
    const { base, headers } = creds();
    const json = await getJson(`${base}/api/situacoes_vendas`, headers);
    const arr: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const wanted = norm(label);
    for (const w of arr) {
      const s = w?.situacao ?? w;
      const name = norm(String(s?.nome ?? s?.descricao ?? ""));
      if (name === wanted) return s?.id ? String(s.id) : null;
    }
    for (const w of arr) {
      const s = w?.situacao ?? w;
      const name = norm(String(s?.nome ?? s?.descricao ?? ""));
      if (name.includes(wanted) || wanted.includes(name)) return s?.id ? String(s.id) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function methodCandidates(method: string): string[] {
  const m = norm(method);
  if (m.includes("mb way") || m.includes("mbway")) return ["mb way", "mbway"];
  if (m.includes("multibanco") || m === "mb") return ["multibanco", "mb"];
  if (m.includes("transfer")) return ["transferencia", "transferência", "transferencia bancaria"];
  if (m.includes("dinheiro") || m.includes("numer")) return ["dinheiro", "numerario"];
  if (m.includes("cart")) return ["cartao", "cartão"];
  return [m];
}

async function resolveFormaPagamentoId(method: string): Promise<string | null> {
  try {
    const { base, headers } = creds();
    const json = await getJson(`${base}/api/formas_pagamentos`, headers);
    const arr: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const wanted = methodCandidates(method);
    let fallback: string | null = null;
    for (const row of arr) {
      const fp = row?.forma_pagamento ?? row;
      const name = norm(String(fp?.nome ?? ""));
      if (!fallback && fp?.id) fallback = String(fp.id);
      if (wanted.some((w) => name === w || name.includes(w))) {
        return fp?.id ? String(fp.id) : null;
      }
    }
    return fallback;
  } catch {
    return null;
  }
}

function money(n: number) {
  return Number((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

function eur(n: number) {
  return `${money(n).toFixed(2)} €`;
}

export function buildClosureObservations(args: {
  outcome: ClosureOutcome;
  payments: Array<{ method_name: string; amount: number; created_at?: string | null }>;
  forecast: number;
  realized: number;
  justification?: string | null;
  partialItems?: Array<{ description: string; delivered: boolean }> | null;
}): string {
  const lines: string[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  lines.push(`[Fecho de rota ${stamp}] ${CLOSURE_SITUACAO_LABEL[args.outcome]}`);

  const byMethod = new Map<string, number>();
  for (const p of args.payments) {
    byMethod.set(p.method_name, money((byMethod.get(p.method_name) ?? 0) + Number(p.amount)));
  }
  if (byMethod.size > 0) {
    lines.push(
      `Recebido: ${Array.from(byMethod, ([m, v]) => `${m} ${eur(v)}`).join(" · ")}`,
    );
  } else {
    lines.push("Recebido: sem recebimentos registados");
  }
  lines.push(`Total recebido: ${eur(args.realized)} · Previsto: ${eur(args.forecast)}`);
  const missing = money(args.forecast - args.realized);
  if (missing > 0.005) lines.push(`Em falta: ${eur(missing)}`);

  if (args.outcome === "entregue_parcial" && args.partialItems?.length) {
    const ok = args.partialItems.filter((i) => i.delivered).map((i) => i.description);
    const no = args.partialItems.filter((i) => !i.delivered).map((i) => i.description);
    if (ok.length) lines.push(`Artigos entregues: ${ok.join("; ")}`);
    if (no.length) lines.push(`Artigos NÃO entregues: ${no.join("; ")}`);
  }
  if (args.justification?.trim()) lines.push(`Justificação: ${args.justification.trim()}`);

  return lines.join("\n");
}

/** Atualiza situação, pagamentos e observações de uma venda no GestãoClick. */
export async function updateGestaoClickVendaClosure(args: {
  vendaId: string;
  situacaoLabel: string;
  payments: Array<{ method_name: string; amount: number; created_at?: string | null }>;
  observacoes: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { base, headers } = creds();

    const existing = await getJson(
      `${base}/api/vendas/${encodeURIComponent(args.vendaId)}`,
      headers,
    );
    const venda: any = existing?.data ?? existing ?? null;
    if (!venda || typeof venda !== "object") {
      return { ok: false, error: "GestãoClick não devolveu a venda existente" };
    }

    const situacaoId = await resolveSituacaoId(args.situacaoLabel);

    const pagamentos: any[] = [];
    for (const p of args.payments) {
      const amount = money(Number(p.amount));
      if (amount <= 0) continue;
      const formaId = await resolveFormaPagamentoId(p.method_name);
      const date = (p.created_at ?? new Date().toISOString()).slice(0, 10);
      pagamentos.push({
        data_vencimento: date,
        valor: amount,
        forma_pagamento_id: formaId ? Number(formaId) || formaId : undefined,
        observacao: `Recebido na entrega — ${p.method_name}`,
      });
    }

    const prevObs = String(venda.observacoes ?? "").trim();
    const body: Record<string, unknown> = {
      ...venda,
      observacoes: prevObs ? `${prevObs}\n\n${args.observacoes}` : args.observacoes,
    };
    if (situacaoId) body["situacao_id"] = situacaoId;
    if (pagamentos.length > 0) body["pagamentos"] = pagamentos;
    if (!body["cliente_id"] && venda.cliente_id) body["cliente_id"] = venda.cliente_id;

    const res = await fetch(`${base}/api/vendas/${encodeURIComponent(args.vendaId)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `GestãoClick PUT ${res.status}: ${text.slice(0, 250)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao atualizar GestãoClick" };
  }
}
