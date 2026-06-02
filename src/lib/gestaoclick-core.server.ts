// Helpers partilhados para chamadas ao GestãoClick. Mantidos fora dos
// ficheiros `.functions.ts` para evitar problemas com o code-splitter
// das server functions do TanStack Start.

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
}

function detectKind(desc: string): OrderItemDTO["kind"] {
  const s = desc.toLowerCase();
  if (/(montagem|montar|instala[cç][aã]o)/.test(s)) return "montagem";
  if (/(entrega|frete|transporte|portes|envio)/.test(s)) return "entrega";
  if (/(servi[cç]o|m[aã]o de obra|reparac)/.test(s)) return "servico";
  return "produto";
}

export function normalizeOrder(
  vendaPayload: any,
  clientePayload: any,
  orderNumber: string,
): OrderDTO {
  const p = vendaPayload?.data ?? vendaPayload?.pedido ?? vendaPayload?.venda ?? vendaPayload ?? {};
  const cliente = clientePayload?.data ?? clientePayload ?? {};

  const vendaEndArr = Array.isArray(p?.enderecos) ? p.enderecos : [];
  const cliEndArr = Array.isArray(cliente?.enderecos) ? cliente.enderecos : [];
  const endNode = vendaEndArr[0]?.endereco ?? cliEndArr[0]?.endereco ?? {};

  const total = Number(p?.valor_total ?? p?.total ?? p?.valor ?? 0);
  const desconto = Number(p?.desconto_valor ?? p?.desconto ?? 0);
  const frete = Number(p?.valor_frete ?? p?.frete ?? 0);

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
      const desc = String(it?.nome_produto ?? it?.nome ?? it?.descricao ?? it?.produto ?? "Produto");
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
  const zipCode =
    String(endNode?.cep ?? endNode?.codigo_postal ?? "") || (cpMatch ? cpMatch[1] : null);

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
  };
}

export function normalizeBaseUrl(baseUrl: string): string {
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

export async function gcFetch(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; json: any }> {
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
      `GestãoClick devolveu resposta inválida (não-JSON). Verifica GESTAOCLICK_BASE_URL. Início: ${snippet}`,
    );
  }
}

/**
 * Busca uma encomenda no GestãoClick e devolve o DTO normalizado.
 * Devolve null se não encontrada ou em erro; lança apenas se credenciais em falta.
 */
export async function fetchOrderDtoFromGestaoClick(
  orderNumber: string,
): Promise<{ dto: OrderDTO | null; error: string | null }> {
  const baseUrl = process.env.GESTAOCLICK_BASE_URL;
  const apiKey = process.env.GESTAOCLICK_API_KEY;
  const email = process.env.GESTAOCLICK_EMAIL;
  if (!baseUrl || !apiKey || !email) {
    return { dto: null, error: "Credenciais GestãoClick em falta" };
  }
  const base = normalizeBaseUrl(baseUrl);
  const headers = {
    "access-token": apiKey,
    "secret-access-token": email,
    Accept: "application/json",
  };

  try {
    const list = await gcFetch(
      `${base}/api/vendas?codigo=${encodeURIComponent(orderNumber)}`,
      headers,
    );
    const arr: any[] = Array.isArray(list.json?.data)
      ? list.json.data
      : Array.isArray(list.json)
        ? list.json
        : [];
    if (list.status === 404 || arr.length === 0) {
      return { dto: null, error: `Encomenda ${orderNumber} não encontrada` };
    }
    const vendaId = arr[0]?.id ?? arr[0]?.venda?.id;
    if (!vendaId) return { dto: null, error: `Encomenda ${orderNumber} sem id interno` };

    const detail = await gcFetch(
      `${base}/api/vendas/${encodeURIComponent(String(vendaId))}`,
      headers,
    );
    if (detail.status === 404 || !detail.json) {
      return { dto: null, error: `Encomenda ${orderNumber} não encontrada` };
    }
    const clienteId = detail.json?.data?.cliente_id ?? arr[0]?.cliente_id ?? null;
    let clientePayload: any = null;
    if (clienteId) {
      try {
        const cli = await gcFetch(
          `${base}/api/clientes/${encodeURIComponent(String(clienteId))}`,
          headers,
        );
        clientePayload = cli.json;
      } catch {
        // ignore
      }
    }
    return { dto: normalizeOrder(detail.json, clientePayload, orderNumber), error: null };
  } catch (error) {
    return {
      dto: null,
      error: error instanceof Error ? error.message : "Falha ao consultar GestãoClick",
    };
  }
}
