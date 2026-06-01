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

function normalizeOrder(payload: any, orderNumber: string): OrderDTO {
  const p = payload?.data ?? payload?.pedido ?? payload?.venda ?? payload;
  const cliente = p?.cliente ?? p?.customer ?? {};
  const endereco = cliente?.endereco ?? p?.endereco ?? {};

  const total = Number(p?.valor_total ?? p?.total ?? p?.valor ?? 0);
  const pago = Number(p?.valor_pago ?? p?.pago ?? 0);
  const desconto = Number(p?.desconto ?? p?.valor_desconto ?? 0);
  const frete = Number(p?.frete ?? p?.valor_frete ?? p?.transporte ?? 0);

  const rawItems = Array.isArray(p?.produtos)
    ? p.produtos
    : Array.isArray(p?.itens)
      ? p.itens
      : [];
  const rawServices = Array.isArray(p?.servicos) ? p.servicos : [];

  const items: OrderItemDTO[] = [
    ...rawItems.map((it: any): OrderItemDTO => {
      const desc = String(
        it?.produto?.nome ?? it?.descricao ?? it?.nome ?? it?.produto ?? "Item",
      );
      const qty = Number(it?.quantidade ?? it?.qtd ?? 1);
      const price = Number(it?.valor ?? it?.valor_unitario ?? it?.preco ?? 0);
      return {
        description: desc,
        quantity: qty,
        price,
        total: Number(it?.valor_total ?? qty * price),
        kind: detectKind(desc),
      };
    }),
    ...rawServices.map((it: any): OrderItemDTO => {
      const desc = String(it?.servico?.nome ?? it?.descricao ?? it?.nome ?? "Serviço");
      const qty = Number(it?.quantidade ?? it?.qtd ?? 1);
      const price = Number(it?.valor ?? it?.valor_unitario ?? it?.preco ?? 0);
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
  const hasDeliveryService =
    items.some((i) => i.kind === "entrega") || frete > 0;

  return {
    order_number: String(p?.codigo ?? p?.numero ?? p?.id ?? orderNumber),
    internal_id: p?.id ? String(p.id) : null,
    date: p?.data ?? p?.data_venda ?? p?.created_at ?? null,
    status: p?.situacao ?? p?.status ?? null,
    customer_name: String(cliente?.nome ?? cliente?.name ?? p?.cliente_nome ?? "—"),
    customer_document: String(cliente?.cpf_cnpj ?? cliente?.nif ?? cliente?.documento ?? "") || null,
    customer_email: String(cliente?.email ?? "") || null,
    address: [endereco?.logradouro ?? endereco?.rua ?? cliente?.endereco, endereco?.numero, endereco?.bairro]
      .filter(Boolean)
      .join(", ") || String(cliente?.endereco ?? "—"),
    address_complement: String(endereco?.complemento ?? "") || null,
    neighborhood: String(endereco?.bairro ?? "") || null,
    zip_code: String(endereco?.cep ?? endereco?.codigo_postal ?? cliente?.cep ?? "") || null,
    city: String(endereco?.cidade ?? endereco?.localidade ?? cliente?.cidade ?? "") || null,
    state: String(endereco?.estado ?? endereco?.uf ?? "") || null,
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
      const dto = normalizeOrder(detail.json, data.orderNumber);

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
