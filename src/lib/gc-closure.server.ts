/**
 * Sincronização do fecho de rota com o GestãoClick.
 * Server-only: usa credenciais em process.env.
 */

export type ClosureOutcome = "entregue" | "entregue_parcial" | "reagendado" | "cancelado";

export const CLOSURE_SITUACAO_LABEL: Record<ClosureOutcome, string> = {
  entregue: "Pedido entregue",
  entregue_parcial: "Entrega Parcial",
  reagendado: "Reagendamento",
  cancelado: "Cancelado",
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
  if (m.includes("mb way") || m.includes("mbway")) return ["multibanco mv", "mb way", "mbway"];
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
    for (const row of arr) {
      const fp = row?.FormasPagamento ?? row?.forma_pagamento ?? row;
      const name = norm(String(fp?.nome ?? ""));
      if (wanted.some((w) => name === w || name.includes(w))) {
        return fp?.id ? String(fp.id) : null;
      }
    }
    return null;
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

async function sendJson(
  method: "POST" | "PUT",
  url: string,
  headers: Record<string, string>,
  body: unknown,
) {
  const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GestãoClick ${method} ${res.status}: ${text.slice(0, 200)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error("GestãoClick devolveu resposta inválida (não-JSON)");
  }
}

/** Marcador único por recebimento, para não duplicar em reenvios. */
function receiptDescription(codigo: string, method: string, amount: number, date: string) {
  return `Venda nº ${codigo} · ${method} · ${money(amount).toFixed(2)} € · entrega ${date}`;
}

/**
 * Atualiza situação e observações da venda e regista os recebimentos no financeiro.
 * Nota: a API de vendas do GestãoClick ignora o bloco `pagamentos` em updates,
 * por isso os valores recebidos são lançados via /api/recebimentos.
 */
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
    if (!situacaoId) {
      return { ok: false, error: `Situação "${args.situacaoLabel}" não encontrada no GestãoClick` };
    }

    const clienteId = String(venda.cliente_id ?? "");
    const codigo = String(venda.codigo ?? args.vendaId);
    const existingPayments: any[] = Array.isArray(venda.pagamentos) ? venda.pagamentos : [];
    const planoContasId =
      (existingPayments[0]?.pagamento ?? existingPayments[0] ?? {})?.plano_contas_id ?? null;

    // 1) Situação + observações na venda
    const prevObs = String(venda.observacoes ?? "").trim();
    const body: Record<string, unknown> = {
      cliente_id: venda.cliente_id,
      situacao_id: Number(situacaoId) || situacaoId,
      observacoes: prevObs ? `${prevObs}\n\n${args.observacoes}` : args.observacoes,
    };
    await sendJson("PUT", `${base}/api/vendas/${encodeURIComponent(args.vendaId)}`, headers, body);

    // 2) Recebimentos no financeiro (um por método), sem duplicar
    let alreadyLaunched: string[] = [];
    if (clienteId) {
      const list = await getJson(
        `${base}/api/recebimentos?cliente_id=${encodeURIComponent(clienteId)}`,
        headers,
      );
      const rows: any[] = Array.isArray(list?.data) ? list.data : [];
      alreadyLaunched = rows.map((r) => norm(String(r?.descricao ?? "")));
    }

    const created: string[] = [];
    for (const p of args.payments) {
      const amount = money(Number(p.amount));
      if (amount <= 0) continue;
      const formaId = await resolveFormaPagamentoId(p.method_name);
      if (!formaId) {
        return {
          ok: false,
          error: `Forma de pagamento "${p.method_name}" não encontrada no GestãoClick`,
        };
      }
      const date = (p.created_at ?? new Date().toISOString()).slice(0, 10);
      const descricao = receiptDescription(codigo, p.method_name, amount, date);
      if (alreadyLaunched.includes(norm(descricao))) continue;
      if (!clienteId) {
        return { ok: false, error: "Venda sem cliente associado no GestãoClick" };
      }
      await sendJson("POST", `${base}/api/recebimentos`, headers, {
        descricao,
        valor: amount.toFixed(2),
        forma_pagamento_id: Number(formaId) || formaId,
        ...(planoContasId ? { plano_contas_id: Number(planoContasId) || planoContasId } : {}),
        entidade: "C",
        cliente_id: Number(clienteId) || clienteId,
        liquidado: "1",
        data_vencimento: date,
        data_liquidacao: date,
        data_competencia: date,
        venda_id: Number(args.vendaId) || args.vendaId,
      });
      created.push(descricao);
    }

    // 3) Verificação
    const verified = await getJson(
      `${base}/api/vendas/${encodeURIComponent(args.vendaId)}`,
      headers,
    );
    const saved: any = verified?.data ?? verified ?? null;
    if (String(saved?.situacao_id ?? "") !== String(situacaoId)) {
      return { ok: false, error: `GestãoClick não aplicou a situação "${args.situacaoLabel}"` };
    }

    const expectedTotal = money(args.payments.reduce((sum, p) => sum + Number(p.amount), 0));
    if (expectedTotal > 0 && clienteId) {
      const list = await getJson(
        `${base}/api/recebimentos?cliente_id=${encodeURIComponent(clienteId)}`,
        headers,
      );
      const rows: any[] = Array.isArray(list?.data) ? list.data : [];
      const wanted = args.payments
        .filter((p) => money(Number(p.amount)) > 0)
        .map((p) =>
          norm(
            receiptDescription(
              codigo,
              p.method_name,
              money(Number(p.amount)),
              (p.created_at ?? new Date().toISOString()).slice(0, 10),
            ),
          ),
        );
      const savedDescriptions = rows.map((r) => norm(String(r?.descricao ?? "")));
      const missing = wanted.filter((w) => !savedDescriptions.includes(w));
      if (missing.length > 0) {
        return {
          ok: false,
          error: `GestãoClick não registou ${missing.length} recebimento(s) desta venda`,
        };
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao atualizar GestãoClick" };
  }
}

