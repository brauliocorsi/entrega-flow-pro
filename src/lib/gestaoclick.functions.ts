import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OrderDTO {
  order_number: string;
  customer_name: string;
  address: string;
  zip_code: string | null;
  city: string | null;
  phone: string | null;
  total_value: number;
  paid_value: number;
  remaining_value: number;
  items: Array<{ description: string; quantity: number; price: number }>;
  
}

function normalizeOrder(payload: any, orderNumber: string): OrderDTO {
  // GestãoClick payloads vary; try common shapes.
  const p = payload?.data ?? payload?.pedido ?? payload?.venda ?? payload;
  const cliente = p?.cliente ?? p?.customer ?? {};
  const endereco = cliente?.endereco ?? p?.endereco ?? {};

  const total = Number(p?.valor_total ?? p?.total ?? p?.valor ?? 0);
  const pago = Number(p?.valor_pago ?? p?.pago ?? 0);
  const itens = Array.isArray(p?.itens) ? p.itens : Array.isArray(p?.produtos) ? p.produtos : [];

  return {
    order_number: String(p?.numero ?? p?.id ?? orderNumber),
    customer_name: String(cliente?.nome ?? cliente?.name ?? p?.cliente_nome ?? "—"),
    address: [endereco?.logradouro ?? endereco?.rua ?? cliente?.endereco, endereco?.numero, endereco?.bairro]
      .filter(Boolean)
      .join(", ") || String(cliente?.endereco ?? "—"),
    zip_code: String(endereco?.cep ?? endereco?.codigo_postal ?? cliente?.cep ?? "") || null,
    city: String(endereco?.cidade ?? endereco?.localidade ?? cliente?.cidade ?? "") || null,
    phone: String(cliente?.telefone ?? cliente?.celular ?? cliente?.phone ?? "") || null,
    total_value: total,
    paid_value: pago,
    remaining_value: Math.max(total - pago, 0),
    items: itens.map((it: any) => ({
      description: String(it?.descricao ?? it?.nome ?? it?.produto ?? "Item"),
      quantity: Number(it?.quantidade ?? it?.qtd ?? 1),
      price: Number(it?.valor ?? it?.preco ?? 0),
    })),
    
  };
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
  .handler(async ({ data, context }) => {
    const baseUrl = process.env.GESTAOCLICK_BASE_URL;
    const apiKey = process.env.GESTAOCLICK_API_KEY;
    const email = process.env.GESTAOCLICK_EMAIL;
    if (!baseUrl || !apiKey || !email) {
      throw new Error("Credenciais GestãoClick em falta");
    }
    const base = baseUrl.replace(/\/$/, "");
    const headers = {
      "access-token": apiKey,
      "secret-access-token": email,
      Accept: "application/json",
    };

    // 1) Listar vendas filtrando pelo código (número visível ao utilizador)
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
      throw new Error(`Encomenda ${data.orderNumber} não encontrada no GestãoClick`);
    }
    const vendaId = arr[0]?.id ?? arr[0]?.venda?.id;
    if (!vendaId) {
      throw new Error(`Encomenda ${data.orderNumber} sem id interno no GestãoClick`);
    }

    // 2) Visualizar venda completa por id interno
    const detail = await gcFetch(
      `${base}/api/vendas/${encodeURIComponent(String(vendaId))}`,
      headers,
    );
    if (detail.status === 404 || !detail.json) {
      throw new Error(`Encomenda ${data.orderNumber} não encontrada no GestãoClick`);
    }
    const dto = normalizeOrder(detail.json, data.orderNumber);

    // check existing active scheduling
    const { data: existing } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, route_id, status, routes:route_id(route_date, zone)")
      .eq("order_number", dto.order_number)
      .in("status", ["agendado", "confirmado"])
      .maybeSingle();

    // previous undelivered (for reschedule context)
    const { data: previousUnfinished } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, route_id, outcome, outcome_notes, routes:route_id(route_date, zone)")
      .eq("order_number", dto.order_number)
      .in("outcome", ["nao_entregue", "entregue_parcial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { order: dto, existingActiveDelivery: existing ?? null, previousUnfinished: previousUnfinished ?? null };
  });
