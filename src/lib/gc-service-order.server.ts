/**
 * Criação/atualização de Ordens de Serviço (assistências) no GestãoClick.
 * Server-only: usa credenciais em process.env.
 */

export type ServiceStatus = "aberta" | "em_curso" | "resolvida";

/** Nomes de situação de OS a procurar, por estado da assistência (por ordem de preferência). */
const SITUACAO_CANDIDATES: Record<ServiceStatus, string[]> = {
  aberta: ["em aberto", "aguardando cliente", "em andamento"],
  em_curso: ["em andamento", "em aberto"],
  resolvida: ["concretizado", "concretizada", "finalizado", "produto entregue"],
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

async function gcRequest(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<any> {
  const { base, headers } = creds();
  const res = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`GestãoClick devolveu resposta inválida (${res.status})`);
  }
  if (!res.ok || json?.status === "error") {
    const msg =
      json?.message ??
      (json?.data && typeof json.data === "object" ? JSON.stringify(json.data) : null) ??
      text.slice(0, 300);
    throw new Error(`GestãoClick ${res.status}: ${msg}`);
  }
  return json;
}

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function resolveSituacaoId(status: ServiceStatus): Promise<string | null> {
  const wanted = SITUACAO_CANDIDATES[status].map(norm);
  const found = new Map<string, string>();
  for (let page = 1; page <= 3; page++) {
    let json: any;
    try {
      json = await gcRequest(`/api/situacoes_ordens_servicos?pagina=${page}`);
    } catch {
      break;
    }
    const arr: any[] = Array.isArray(json?.data) ? json.data : [];
    for (const row of arr) {
      const s = row?.situacao ?? row;
      const name = norm(String(s?.nome ?? ""));
      if (name && s?.id && !found.has(name)) found.set(name, String(s.id));
    }
    if (!json?.meta?.proxima_pagina) break;
  }
  for (const w of wanted) {
    if (found.has(w)) return found.get(w)!;
    for (const [name, id] of found) {
      if (name.includes(w)) return id;
    }
  }
  return null;
}

/** Procura a venda pelo código para obter cliente_id e produtos. */
export async function findVendaByCodigo(orderNumber: string): Promise<any | null> {
  try {
    const list = await gcRequest(`/api/vendas?codigo=${encodeURIComponent(orderNumber)}`);
    const arr: any[] = Array.isArray(list?.data) ? list.data : [];
    const first = arr[0]?.venda ?? arr[0];
    const id = first?.id;
    if (!id) return null;
    const detail = await gcRequest(`/api/vendas/${encodeURIComponent(String(id))}`);
    return detail?.data ?? first;
  } catch {
    return null;
  }
}

export interface ServiceOrderInput {
  order_number: string;
  customer_name: string | null;
  product_name: string;
  description: string;
  opened_by_name: string | null;
  created_at: string;
  route_zone: string | null;
  route_date: string | null;
  photo_urls: string[];
  resolution_notes: string | null;
  status: ServiceStatus;
  gc_client_id?: string | null;
}

function buildObservacoes(input: ServiceOrderInput) {
  const lines = [
    `Assistência da encomenda nº ${input.order_number}`,
    input.customer_name ? `Cliente: ${input.customer_name}` : null,
    `Produto avariado: ${input.product_name}`,
    input.opened_by_name ? `Aberta por: ${input.opened_by_name}` : null,
    `Data de abertura: ${new Date(input.created_at).toLocaleString("pt-PT")}`,
    input.route_zone || input.route_date
      ? `Rota: ${input.route_zone ?? "—"}${input.route_date ? ` (${input.route_date})` : ""}`
      : null,
    "",
    "Relato do entregador:",
    input.description,
  ].filter(Boolean) as string[];

  if (input.photo_urls.length) {
    lines.push("", `Fotos (${input.photo_urls.length}):`, ...input.photo_urls);
  }
  if (input.resolution_notes?.trim()) {
    lines.push("", "Notas de resolução (ADM):", input.resolution_notes.trim());
  }
  return lines.join("\n");
}

function buildPayload(input: ServiceOrderInput, clienteId: string, situacaoId: string | null) {
  const observacoes = buildObservacoes(input);
  const payload: Record<string, unknown> = {
    cliente_id: Number(clienteId),
    data_entrada: new Date(input.created_at).toISOString().slice(0, 10),
    observacoes,
    observacoes_interna: input.resolution_notes?.trim() || "",
    equipamentos: [
      {
        equipamento: {
          equipamento: input.product_name,
          condicoes: `Encomenda nº ${input.order_number}`,
          defeitos: input.description,
          solucao: input.resolution_notes?.trim() || "",
        },
      },
    ],
  };
  if (situacaoId) payload["situacao_id"] = Number(situacaoId);
  return payload;
}

export interface ServiceOrderResult {
  gc_os_id: string;
  gc_os_number: string | null;
  gc_client_id: string;
}

export async function createServiceOrder(input: ServiceOrderInput): Promise<ServiceOrderResult> {
  let clienteId = input.gc_client_id ?? null;
  if (!clienteId) {
    const venda = await findVendaByCodigo(input.order_number);
    clienteId = venda?.cliente_id ? String(venda.cliente_id) : null;
  }
  if (!clienteId) {
    throw new Error(
      `Não foi possível identificar o cliente no GestãoClick a partir da encomenda ${input.order_number}`,
    );
  }
  const situacaoId = await resolveSituacaoId(input.status);
  const json = await gcRequest("/api/ordens_servicos", {
    method: "POST",
    body: buildPayload(input, clienteId, situacaoId),
  });
  const data = json?.data ?? json;
  const id = data?.id ?? data?.ordem_servico?.id;
  if (!id) throw new Error("GestãoClick não devolveu o identificador da ordem de serviço");
  return {
    gc_os_id: String(id),
    gc_os_number: data?.codigo ? String(data.codigo) : null,
    gc_client_id: clienteId,
  };
}

export async function updateServiceOrder(
  osId: string,
  input: ServiceOrderInput,
): Promise<ServiceOrderResult> {
  let clienteId = input.gc_client_id ?? null;
  if (!clienteId) {
    const venda = await findVendaByCodigo(input.order_number);
    clienteId = venda?.cliente_id ? String(venda.cliente_id) : null;
  }
  if (!clienteId) throw new Error("Cliente do GestãoClick não identificado para atualizar a OS");
  const situacaoId = await resolveSituacaoId(input.status);
  const json = await gcRequest(`/api/ordens_servicos/${encodeURIComponent(osId)}`, {
    method: "PUT",
    body: buildPayload(input, clienteId, situacaoId),
  });
  const data = json?.data ?? json;
  return {
    gc_os_id: String(data?.id ?? osId),
    gc_os_number: data?.codigo ? String(data.codigo) : null,
    gc_client_id: clienteId,
  };
}
