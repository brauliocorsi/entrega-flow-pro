import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OrderItemDTO {
  description: string;
  quantity: number;
  price: number;
  total: number;
  kind: "produto" | "montagem" | "entrega" | "servico";
}

export interface OrderDTO {
  order_number: string;
  internal_id: string | null;
  date: string | null;
  status: string | null;
  customer_name: string;
  customer_document: string | null;
  customer_email: string | null;
  address: string;
  address_complement: string | null;
  neighborhood: string | null;
  zip_code: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  mobile: string | null;
  total_value: number;
  paid_value: number;
  remaining_value: number;
  discount: number;
  shipping: number;
  items: OrderItemDTO[];
  has_assembly: boolean;
  has_delivery_service: boolean;
  observations: string | null;
  pagamentos: any[];
  delivery_date: string | null;
}

export interface FetchOrderResult {
  order: OrderDTO | null;
  existingActiveDelivery: any | null;
  previousUnfinished: any | null;
  error: string | null;
}

function detectKind(desc: string): OrderItemDTO["kind"] {
  const s = desc.toLowerCase();
  if (/(montagem|montar|instala[cç][aã]o)/.test(s)) return "montagem";
  if (/(entrega|frete|transporte|portes|envio)/.test(s)) return "entrega";
  if (/(servi[cç]o|m[aã]o de obra|reparac)/.test(s)) return "servico";
  return "produto";
}

function normalizeOrder(
  vendaPayload: any,
  clientePayload: any,
  orderNumber: string,
): OrderDTO {
  const p = vendaPayload?.data ?? vendaPayload?.pedido ?? vendaPayload?.venda ?? vendaPayload ?? {};
  const cliente = clientePayload?.data ?? clientePayload ?? {};

  // Address: prefer venda.enderecos[0], fallback to cliente.enderecos[0]
  const vendaEndArr = Array.isArray(p?.enderecos) ? p.enderecos : [];
  const cliEndArr = Array.isArray(cliente?.enderecos) ? cliente.enderecos : [];
  const endNode = vendaEndArr[0]?.endereco ?? cliEndArr[0]?.endereco ?? {};

  const total = Number(p?.valor_total ?? p?.total ?? p?.valor ?? 0);
  const desconto = Number(p?.desconto_valor ?? p?.desconto ?? 0);
  const frete = Number(p?.valor_frete ?? p?.frete ?? 0);

  // Pagamentos: somar valores cuja observação indica recebido (heurística)
  const pagamentos = Array.isArray(p?.pagamentos) ? p.pagamentos : [];
  const pago = pagamentos.reduce((acc: number, w: any) => {
    const pay = w?.pagamento ?? w ?? {};
    const obs = String(pay?.observacao ?? "").toLowerCase();
    const isPaid = /pago|recebid|liquidad/.test(obs);
    return isPaid ? acc + Number(pay?.valor ?? 0) : acc;
  }, 0);

  const rawItems = Array.isArray(p?.produtos) ? p.produtos : Array.isArray(p?.itens) ? p.itens : [];
  const rawServices = Array.isArray(p?.servicos) ? p.servicos : [];

  const items: OrderItemDTO[] = [
    ...rawItems.map((wrap: any): OrderItemDTO => {
      const it = wrap?.produto ?? wrap ?? {};
      const desc = String(
        it?.nome_produto ?? it?.nome ?? it?.descricao ?? it?.produto ?? "Produto",
      );
      const qty = Number(it?.quantidade ?? it?.qtd ?? 1);
      const price = Number(it?.valor_venda ?? it?.valor ?? it?.valor_unitario ?? it?.preco ?? 0);
      return {
        description: desc,
        quantity: qty,
        price,
        total: Number(it?.valor_total ?? qty * price),
        kind: detectKind(desc),
      };
    }),
    ...rawServices.map((wrap: any): OrderItemDTO => {
      const it = wrap?.servico ?? wrap ?? {};
      const desc = String(it?.nome_servico ?? it?.nome ?? it?.descricao ?? "Serviço");
      const qty = Number(it?.quantidade ?? it?.qtd ?? 1);
      const price = Number(it?.valor_venda ?? it?.valor ?? it?.valor_unitario ?? it?.preco ?? 0);
      return {
        description: desc,
        quantity: qty,
        price,
        total: Number(it?.valor_total ?? qty * price),
        kind: detectKind(desc),
      };
    }),
  ];

  const obs = p?.observacoes ?? p?.observacao ?? p?.obs ?? null;
  const obsText = obs ? String(obs) : null;
  const hasAssembly =
    items.some((i) => i.kind === "montagem") ||
    (obsText ? /montagem|montar|instala/i.test(obsText) : false);
  const hasDeliveryService = items.some((i) => i.kind === "entrega") || frete > 0;

  // Heurística para extrair CP português ("4715-105") de qualquer campo de morada
  const allAddrStr = [
    endNode?.logradouro,
    endNode?.numero,
    endNode?.complemento,
    endNode?.bairro,
    endNode?.nome_cidade,
  ]
    .filter(Boolean)
    .join(" ");
  const cpMatch = allAddrStr.match(/\b(\d{4}-\d{3})\b/);
  const zipCode = String(endNode?.cep ?? endNode?.codigo_postal ?? "") || (cpMatch ? cpMatch[1] : null);

  const customerName = String(
    cliente?.nome ?? cliente?.razao_social ?? p?.nome_cliente ?? "—",
  );
  const customerDoc =
    String(cliente?.cpf ?? cliente?.cnpj ?? cliente?.nif ?? cliente?.documento ?? "") || null;

  return {
    order_number: String(p?.codigo ?? p?.numero ?? p?.id ?? orderNumber),
    internal_id: p?.id ? String(p.id) : null,
    date: p?.data ?? p?.data_venda ?? p?.cadastrado_em ?? null,
    status: p?.nome_situacao ?? p?.situacao ?? p?.status ?? null,
    customer_name: customerName,
    customer_document: customerDoc,
    customer_email: String(cliente?.email ?? cliente?.email_acesso ?? "") || null,
    address:
      [endNode?.logradouro, endNode?.numero].filter(Boolean).join(", ") ||
      String(endNode?.logradouro ?? "—"),
    address_complement: String(endNode?.complemento ?? "") || null,
    neighborhood: String(endNode?.bairro ?? "") || null,
    zip_code: zipCode,
    city: String(endNode?.nome_cidade ?? endNode?.cidade ?? endNode?.localidade ?? "") || null,
    state: String(endNode?.estado ?? endNode?.uf ?? "") || null,
    phone: String(cliente?.telefone ?? cliente?.phone ?? "") || null,
    mobile: String(cliente?.celular ?? cliente?.telemovel ?? "") || null,
    total_value: total,
    paid_value: pago,
    remaining_value: Math.max(total - pago, 0),
    discount: desconto,
    shipping: frete,
    items,
    has_assembly: hasAssembly,
    has_delivery_service: hasDeliveryService,
    observations: obsText,
    pagamentos,
    delivery_date: (p?.prazo_entrega ?? p?.data_entrega ?? null) || null,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/$/, "");

    if (
      hostname === "gestaoclick.com" ||
      hostname === "www.gestaoclick.com" ||
      pathname === "/integracao_api/inicio" ||
      pathname === "/integracao_api/login"
    ) {
      return "https://api.gestaoclick.com";
    }

    return `${url.origin}${pathname}`;
  } catch {
    return trimmed.replace(/\/integracao_api\/(inicio|login)$/, "");
  }
}

async function gcFetch(url: string, headers: Record<string, string>): Promise<{ status: number; json: any }> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error("Credenciais GestãoClick inválidas (access-token/secret-access-token)");
  }
  if (res.status === 429) {
    throw new Error("Limite de pedidos GestãoClick atingido. Tenta novamente em alguns segundos.");
  }
  if (!res.ok && res.status !== 404) {
    throw new Error(`GestãoClick respondeu ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return { status: res.status, json: text ? JSON.parse(text) : null };
  } catch {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `GestãoClick devolveu resposta inválida (não-JSON). Verifica GESTAOCLICK_BASE_URL (deve ser https://api.gestaoclick.com). Início: ${snippet}`,
    );
  }
}

export async function updateGestaoClickVendaSchedule(args: {
  vendaId: string;
  routeDate: string | null; // YYYY-MM-DD, ou null para limpar
  statusLabel?: string; // default: "Agendado Entrega"
}): Promise<{ ok: boolean; situacaoId?: string; error?: string }> {
  const baseUrl = process.env.GESTAOCLICK_BASE_URL;
  const apiKey = process.env.GESTAOCLICK_API_KEY;
  const email = process.env.GESTAOCLICK_EMAIL;
  if (!baseUrl || !apiKey || !email) return { ok: false, error: "Credenciais GestãoClick em falta" };

  const base = normalizeBaseUrl(baseUrl);
  const headers = {
    "access-token": apiKey,
    "secret-access-token": email,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const wantedLabel = (args.statusLabel ?? "Agendado Entrega").toLowerCase().trim();

  try {
    // 1) procurar situação por nome
    let situacaoId: string | undefined;
    try {
      const sit = await gcFetch(`${base}/api/situacoes_vendas`, headers);
      const arr: any[] = Array.isArray(sit.json?.data) ? sit.json.data : Array.isArray(sit.json) ? sit.json : [];
      for (const w of arr) {
        const s = w?.situacao ?? w;
        const name = String(s?.nome ?? s?.descricao ?? "").toLowerCase().trim();
        if (name === wantedLabel || name.includes(wantedLabel)) {
          situacaoId = String(s?.id ?? "");
          break;
        }
      }
    } catch {
      // ignore — segue sem alterar situação
    }

    // 2) buscar venda existente — GestãoClick PUT substitui o recurso,
    //    se enviarmos só alguns campos apaga os restantes (cliente, produtos, etc.)
    const existing = await gcFetch(
      `${base}/api/vendas/${encodeURIComponent(args.vendaId)}`,
      headers,
    );
    const venda: any = existing.json?.data ?? existing.json ?? null;
    if (!venda || typeof venda !== "object") {
      return { ok: false, error: "GestãoClick não devolveu a venda existente" };
    }

    // Merge: preserva todos os campos da venda e altera apenas prazo_entrega + situacao_id
    const body: Record<string, unknown> = {
      ...venda,
      prazo_entrega: args.routeDate ?? "",
    };
    if (situacaoId) body.situacao_id = situacaoId;
    // Segurança extra: garantir que o cliente_id continua presente
    if (!body.cliente_id && venda.cliente_id) body.cliente_id = venda.cliente_id;

    const res = await fetch(`${base}/api/vendas/${encodeURIComponent(args.vendaId)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `GestãoClick PUT ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, situacaoId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao atualizar GestãoClick" };
  }
}

export const fetchOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderNumber: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }): Promise<FetchOrderResult> => {
    const baseUrl = process.env.GESTAOCLICK_BASE_URL;
    const apiKey = process.env.GESTAOCLICK_API_KEY;
    const email = process.env.GESTAOCLICK_EMAIL;
    if (!baseUrl || !apiKey || !email) {
      return {
        order: null,
        existingActiveDelivery: null,
        previousUnfinished: null,
        error: "Credenciais GestãoClick em falta",
      };
    }
    const base = normalizeBaseUrl(baseUrl);
    const headers = {
      "access-token": apiKey,
      "secret-access-token": email,
      Accept: "application/json",
    };

    try {
      const list = await gcFetch(
        `${base}/api/vendas?codigo=${encodeURIComponent(data.orderNumber)}`,
        headers,
      );
      const arr: any[] = Array.isArray(list.json?.data)
        ? list.json.data
        : Array.isArray(list.json)
          ? list.json
          : [];
      if (list.status === 404 || arr.length === 0) {
        return {
          order: null,
          existingActiveDelivery: null,
          previousUnfinished: null,
          error: `Encomenda ${data.orderNumber} não encontrada no GestãoClick`,
        };
      }
      const vendaId = arr[0]?.id ?? arr[0]?.venda?.id;
      if (!vendaId) {
        return {
          order: null,
          existingActiveDelivery: null,
          previousUnfinished: null,
          error: `Encomenda ${data.orderNumber} sem id interno no GestãoClick`,
        };
      }

      const detail = await gcFetch(
        `${base}/api/vendas/${encodeURIComponent(String(vendaId))}`,
        headers,
      );
      if (detail.status === 404 || !detail.json) {
        return {
          order: null,
          existingActiveDelivery: null,
          previousUnfinished: null,
          error: `Encomenda ${data.orderNumber} não encontrada no GestãoClick`,
        };
      }
      const clienteId =
        detail.json?.data?.cliente_id ?? arr[0]?.cliente_id ?? null;
      let clientePayload: any = null;
      if (clienteId) {
        try {
          const cli = await gcFetch(
            `${base}/api/clientes/${encodeURIComponent(String(clienteId))}`,
            headers,
          );
          clientePayload = cli.json;
        } catch {
          // ignore - normalizeOrder will fall back to venda fields
        }
      }
      const dto = normalizeOrder(detail.json, clientePayload, data.orderNumber);

      const { data: existing } = await context.supabase
        .from("scheduled_deliveries")
        .select("id, route_id, status, routes:route_id(route_date, zone)")
        .eq("order_number", dto.order_number)
        .in("status", ["agendado", "confirmado"])
        .maybeSingle();

      const { data: previousUnfinished } = await context.supabase
        .from("scheduled_deliveries")
        .select("id, route_id, outcome, outcome_notes, routes:route_id(route_date, zone)")
        .eq("order_number", dto.order_number)
        .in("outcome", ["nao_entregue", "entregue_parcial"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        order: dto,
        existingActiveDelivery: existing ?? null,
        previousUnfinished: previousUnfinished ?? null,
        error: null,
      };
    } catch (error) {
      return {
        order: null,
        existingActiveDelivery: null,
        previousUnfinished: null,
        error: error instanceof Error ? error.message : "Falha ao consultar GestãoClick",
      };
    }
  });

export interface AvailableOrderDTO {
  internal_id: string;
  order_number: string;
  customer_name: string;
  city: string | null;
  zip_code: string | null;
  total_value: number;
  situation: string;
  date: string | null;
  alreadyScheduled: boolean;
  scheduledRouteId: string | null;
  scheduledRouteDate: string | null;
}

export interface ListAvailableOrdersResult {
  orders: AvailableOrderDTO[];
  error: string | null;
}

const DEFAULT_AVAILABLE_SITUATIONS = [
  "Disponível para entrega",
  "Disponível para levantamento",
];

export const listAvailableOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        situations: z.array(z.string().min(1).max(80)).max(10).optional(),
        query: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<ListAvailableOrdersResult> => {
    const baseUrl = process.env.GESTAOCLICK_BASE_URL;
    const apiKey = process.env.GESTAOCLICK_API_KEY;
    const email = process.env.GESTAOCLICK_EMAIL;
    if (!baseUrl || !apiKey || !email) {
      return { orders: [], error: "Credenciais GestãoClick em falta" };
    }
    const base = normalizeBaseUrl(baseUrl);
    const headers = {
      "access-token": apiKey,
      "secret-access-token": email,
      Accept: "application/json",
    };
    const wanted = (data.situations && data.situations.length > 0
      ? data.situations
      : DEFAULT_AVAILABLE_SITUATIONS
    ).map((s) => s.toLowerCase().trim());

    try {
      // Resolver situacao_id por nome
      const sitRes = await gcFetch(`${base}/api/situacoes_vendas`, headers);
      const sitArr: any[] = Array.isArray(sitRes.json?.data)
        ? sitRes.json.data
        : Array.isArray(sitRes.json)
          ? sitRes.json
          : [];
      const matched: Array<{ id: string; nome: string }> = [];
      for (const w of sitArr) {
        const s = w?.situacao ?? w;
        const name = String(s?.nome ?? s?.descricao ?? "").toLowerCase().trim();
        if (!name) continue;
        if (wanted.some((wl) => name === wl || name.includes(wl) || wl.includes(name))) {
          matched.push({ id: String(s?.id ?? ""), nome: String(s?.nome ?? s?.descricao ?? "") });
        }
      }
      if (matched.length === 0) {
        return {
          orders: [],
          error: `Nenhuma situação no GestãoClick corresponde a: ${(data.situations ?? DEFAULT_AVAILABLE_SITUATIONS).join(", ")}`,
        };
      }

      // Listar vendas por cada situação
      const all: AvailableOrderDTO[] = [];
      for (const sit of matched) {
        let page = 1;
        let collected = 0;
        while (collected < data.limit && page <= 10) {
          const url = `${base}/api/vendas?situacao_id=${encodeURIComponent(sit.id)}&pagina=${page}`;
          const res = await gcFetch(url, headers);
          const arr: any[] = Array.isArray(res.json?.data)
            ? res.json.data
            : Array.isArray(res.json)
              ? res.json
              : [];
          if (arr.length === 0) break;
          for (const wrap of arr) {
            const v = wrap?.venda ?? wrap ?? {};
            // Filtrar em memória: alguns ambientes ignoram situacao_id
            const sitNome = String(v?.nome_situacao ?? v?.situacao ?? "").toLowerCase();
            if (sitNome && !wanted.some((wl) => sitNome.includes(wl) || wl.includes(sitNome))) {
              continue;
            }
            const endNode = Array.isArray(v?.enderecos)
              ? v.enderecos[0]?.endereco ?? {}
              : {};
            const code = String(v?.codigo ?? v?.numero ?? v?.id ?? "");
            const cliente = String(v?.nome_cliente ?? v?.cliente?.nome ?? "—");
            // Junta todos os campos de morada para extrair CP e localidade se não vierem separados
            const addrBlob = [
              endNode?.logradouro,
              endNode?.numero,
              endNode?.complemento,
              endNode?.bairro,
              endNode?.nome_cidade,
              endNode?.cidade,
              endNode?.localidade,
              endNode?.cep,
              endNode?.codigo_postal,
            ]
              .filter(Boolean)
              .map((s) => String(s))
              .join(" ");
            const cpMatch = addrBlob.match(/\b(\d{4}-\d{3})\b/);
            let cep = String(endNode?.cep ?? endNode?.codigo_postal ?? "").trim() || null;
            if (!cep && cpMatch) cep = cpMatch[1];
            let cidade =
              String(endNode?.nome_cidade ?? endNode?.cidade ?? endNode?.localidade ?? "").trim() ||
              null;
            if (!cidade && cpMatch) {
              // texto imediatamente a seguir ao CP costuma ser a localidade
              const after = addrBlob.slice(addrBlob.indexOf(cpMatch[1]) + cpMatch[1].length);
              const loc = after
                .replace(/^[\s,\-–]+/, "")
                .split(/[,\-–\n]/)[0]
                .trim();
              if (loc) cidade = loc;
            }
            all.push({
              internal_id: String(v?.id ?? ""),
              order_number: code,
              customer_name: cliente,
              city: cidade,
              zip_code: cep,
              total_value: Number(v?.valor_total ?? v?.total ?? 0),
              situation: sit.nome,
              date: v?.data ?? v?.data_venda ?? v?.cadastrado_em ?? null,
              alreadyScheduled: false,
              scheduledRouteId: null,
              scheduledRouteDate: null,
            });
            collected += 1;
            if (collected >= data.limit) break;
          }
          // Heurística de paginação
          if (arr.length < 20) break;
          page += 1;
        }
      }

      // Deduplicar por order_number
      const map = new Map<string, AvailableOrderDTO>();
      for (const o of all) {
        if (!map.has(o.order_number)) map.set(o.order_number, o);
      }
      let list = Array.from(map.values());

      // Filtro de pesquisa local
      if (data.query) {
        const q = data.query.toLowerCase();
        list = list.filter(
          (o) =>
            o.order_number.toLowerCase().includes(q) ||
            o.customer_name.toLowerCase().includes(q) ||
            (o.city ?? "").toLowerCase().includes(q),
        );
      }

      // Cruzar com scheduled_deliveries activas
      const codes = list.map((o) => o.order_number);
      if (codes.length > 0) {
        const { data: scheduled } = await context.supabase
          .from("scheduled_deliveries")
          .select("order_number, route_id, status, routes:route_id(route_date)")
          .in("order_number", codes)
          .in("status", ["agendado", "confirmado"]);
        const sm = new Map<string, { route_id: string; route_date: string | null }>();
        for (const s of scheduled ?? []) {
          sm.set(String(s.order_number), {
            route_id: String(s.route_id),
            route_date: (s as any).routes?.route_date ?? null,
          });
        }
        list = list.map((o) => {
          const sx = sm.get(o.order_number);
          if (!sx) return o;
          return {
            ...o,
            alreadyScheduled: true,
            scheduledRouteId: sx.route_id,
            scheduledRouteDate: sx.route_date,
          };
        });
      }

      // Ordenar: não agendados primeiro, depois por data desc
      list.sort((a, b) => {
        if (a.alreadyScheduled !== b.alreadyScheduled) return a.alreadyScheduled ? 1 : -1;
        const da = a.date ? Date.parse(a.date) : 0;
        const db = b.date ? Date.parse(b.date) : 0;
        return db - da;
      });

      return { orders: list, error: null };
    } catch (e) {
      return {
        orders: [],
        error: e instanceof Error ? e.message : "Falha ao listar vendas",
      };
    }
  });
