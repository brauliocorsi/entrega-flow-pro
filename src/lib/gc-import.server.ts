import { gcFetch, normalizeBaseUrl, normalizeOrder, type OrderDTO } from "./gestaoclick.functions";

export interface GcCredentials {
  base: string;
  headers: Record<string, string>;
}

export function gcCredentials(): GcCredentials | null {
  const baseUrl = process.env["GESTAOCLICK_BASE_URL"];
  const apiKey = process.env["GESTAOCLICK_API_KEY"];
  const email = process.env["GESTAOCLICK_EMAIL"];
  if (!baseUrl || !apiKey || !email) return null;
  return {
    base: normalizeBaseUrl(baseUrl),
    headers: {
      "access-token": apiKey,
      "secret-access-token": email,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
}

export interface GcDatedOrder {
  internal_id: string;
  order_number: string;
  customer_name: string;
  cliente_id: string | null;
  situation: string;
  delivery_date: string;
  total_value: number;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  phone: string | null;
  has_assembly: boolean;
}

/** Situações consideradas "marcações" (agendamentos) no GestãoClick. */
function isSchedulingSituation(name: string): boolean {
  return /agend|dispon|reagend|levantamento/i.test(name);
}

function pickAddress(node: any): { address: string | null; zip: string | null; city: string | null } {
  if (!node) return { address: null, zip: null, city: null };
  const blob = [
    node?.logradouro,
    node?.numero,
    node?.complemento,
    node?.bairro,
    node?.nome_cidade,
    node?.cidade,
    node?.localidade,
    node?.cep,
    node?.codigo_postal,
  ]
    .filter(Boolean)
    .map((s: any) => String(s))
    .join(" ");
  const cpMatch = blob.match(/\b(\d{4}-\d{3})\b/);
  const cp4Match = cpMatch ? null : blob.match(/\b([1-9]\d{3})\b/);
  let zip = String(node?.cep ?? node?.codigo_postal ?? "").trim() || null;
  if (!zip && cpMatch) zip = cpMatch[1];
  else if (!zip && cp4Match) zip = cp4Match[1];
  let city =
    String(node?.nome_cidade ?? node?.cidade ?? node?.localidade ?? "").trim() || null;
  if (!city && cpMatch) {
    const after = blob.slice(blob.indexOf(cpMatch[1]) + cpMatch[1].length);
    const loc = after.replace(/^[\s,\-–]+/, "").split(/[,\-–\n]/)[0]?.trim();
    if (loc && !/^\d/.test(loc)) city = loc;
  }
  const address =
    [node?.logradouro, node?.numero].filter(Boolean).join(", ") ||
    (node?.logradouro ? String(node.logradouro) : null);
  return { address: address || null, zip, city };
}

/** Lê todas as vendas do GestãoClick cujo prazo de entrega é exactamente `date`. */
export async function fetchSalesByDeliveryDate(args: {
  date: string;
  scanAllSituations?: boolean;
  maxPagesPerSituation?: number;
}): Promise<{ orders: GcDatedOrder[]; error: string | null }> {
  const creds = gcCredentials();
  if (!creds) return { orders: [], error: "Credenciais GestãoClick em falta" };
  const { base, headers } = creds;
  const maxPages = args.maxPagesPerSituation ?? 12;

  try {
    const sitRes = await gcFetch(`${base}/api/situacoes_vendas`, headers);
    const sitArr: any[] = Array.isArray(sitRes.json?.data) ? sitRes.json.data : [];
    const situations = sitArr
      .map((w) => {
        const s = w?.situacao ?? w;
        return { id: String(s?.id ?? ""), nome: String(s?.nome ?? s?.descricao ?? "") };
      })
      .filter((s) => s.id && s.nome)
      .filter((s) => (args.scanAllSituations ? true : isSchedulingSituation(s.nome)));

    const raw: GcDatedOrder[] = [];
    const seen = new Set<string>();

    for (const sit of situations) {
      let page = 1;
      let totalPages = 1;
      while (page <= Math.min(totalPages, maxPages)) {
        const res = await gcFetch(
          `${base}/api/vendas?situacao_id=${encodeURIComponent(sit.id)}&pagina=${page}`,
          headers,
        );
        const meta = res.json?.meta ?? {};
        totalPages = Number(meta?.total_paginas ?? 1) || 1;
        const arr: any[] = Array.isArray(res.json?.data) ? res.json.data : [];
        if (arr.length === 0) break;
        for (const wrap of arr) {
          const v = wrap?.venda ?? wrap ?? {};
          const prazo = String(v?.prazo_entrega ?? "").slice(0, 10);
          if (prazo !== args.date) continue;
          const code = String(v?.codigo ?? v?.numero ?? v?.id ?? "");
          if (!code || seen.has(code)) continue;
          seen.add(code);
          const endNode = Array.isArray(v?.enderecos) ? v.enderecos[0]?.endereco : null;
          const parsed = pickAddress(endNode);
          raw.push({
            internal_id: String(v?.id ?? ""),
            order_number: code,
            customer_name: String(v?.nome_cliente ?? "—"),
            cliente_id: v?.cliente_id ? String(v.cliente_id) : null,
            situation: String(v?.nome_situacao ?? sit.nome),
            delivery_date: prazo,
            total_value: Number(v?.valor_total ?? 0),
            address: parsed.address,
            zip_code: parsed.zip,
            city: parsed.city,
            phone: null,
            has_assembly: Number(v?.valor_servicos ?? 0) > 0,
          });
        }
        page += 1;
      }
    }

    // Completar moradas em falta a partir da ficha do cliente
    const clienteCache = new Map<string, any>();
    for (const o of raw) {
      if (o.zip_code && o.address) continue;
      if (!o.cliente_id) continue;
      let cli = clienteCache.get(o.cliente_id);
      if (cli === undefined) {
        try {
          const c = await gcFetch(
            `${base}/api/clientes/${encodeURIComponent(o.cliente_id)}`,
            headers,
          );
          cli = c.json?.data ?? c.json ?? null;
        } catch {
          cli = null;
        }
        clienteCache.set(o.cliente_id, cli);
      }
      if (!cli) continue;
      const node = Array.isArray(cli?.enderecos) ? cli.enderecos[0]?.endereco : null;
      const parsed = pickAddress(node);
      o.address = o.address ?? parsed.address;
      o.zip_code = o.zip_code ?? parsed.zip;
      o.city = o.city ?? parsed.city;
      o.phone = o.phone ?? (String(cli?.telefone ?? cli?.celular ?? "") || null);
    }

    raw.sort((a, b) => (a.zip_code ?? "").localeCompare(b.zip_code ?? ""));
    return { orders: raw, error: null };
  } catch (e) {
    return {
      orders: [],
      error: e instanceof Error ? e.message : "Falha ao consultar GestãoClick",
    };
  }
}

/** Detalhe completo de uma venda (para gravar a entrega com valores certos). */
export async function fetchSaleDetail(
  vendaId: string,
  fallbackCode: string,
): Promise<OrderDTO | null> {
  const creds = gcCredentials();
  if (!creds) return null;
  const { base, headers } = creds;
  const detail = await gcFetch(`${base}/api/vendas/${encodeURIComponent(vendaId)}`, headers);
  if (!detail.json) return null;
  const clienteId = detail.json?.data?.cliente_id ?? null;
  let clientePayload: any = null;
  if (clienteId) {
    try {
      const c = await gcFetch(
        `${base}/api/clientes/${encodeURIComponent(String(clienteId))}`,
        headers,
      );
      clientePayload = c.json;
    } catch {
      clientePayload = null;
    }
  }
  return normalizeOrder(detail.json, clientePayload, fallbackCode);
}
