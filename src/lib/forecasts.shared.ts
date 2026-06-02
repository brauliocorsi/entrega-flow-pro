// Heurística partilhada para identificar pagamentos marcados como
// "Pagar na entrega" no payload do GestãoClick.

const COD_REGEX = /(pagar\s*na\s*entrega|à\s*entrega|a\s*entrega|na\s*entrega|cod|contra[-\s]?reembolso|dinheiro\s*na\s*entrega)/i;

export function isCodPayment(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  const fields = [p.observacao, p.observacoes, p.forma_pagamento, p.nome_forma_pagamento, p.descricao]
    .filter(Boolean)
    .map((v) => String(v));
  return fields.some((f) => COD_REGEX.test(f));
}

export interface ForecastItem {
  delivery_id: string;
  order_number: string;
  customer_name: string;
  total_value: number;
  products_value: number;
  services_value: number;
  forecast_value: number;
  payment_notes: string[];
}

export function computeForecastForDelivery(d: any): ForecastItem {
  const payload = d?.order_payload ?? {};
  const items: any[] = Array.isArray(payload.items) ? payload.items : [];
  const servicesValue = items
    .filter((i) => i?.kind && i.kind !== "produto")
    .reduce((acc, i) => acc + Number(i?.total ?? 0), 0);
  const productsValue = items
    .filter((i) => !i?.kind || i.kind === "produto")
    .reduce((acc, i) => acc + Number(i?.total ?? 0), 0);

  const pagamentos: any[] = Array.isArray(payload.pagamentos)
    ? payload.pagamentos.map((w: any) => w?.pagamento ?? w)
    : [];

  const codPagamentos = pagamentos.filter(isCodPayment);
  let forecastValue = codPagamentos.reduce((acc, p) => acc + Number(p?.valor ?? 0), 0);

  // Fallback: se não há pagamentos identificados como "Pagar na entrega"
  // mas existe valor por receber, considera o remaining como previsto.
  if (forecastValue === 0 && pagamentos.length === 0) {
    forecastValue = Number(d?.remaining_value ?? 0);
  }

  const paymentNotes = codPagamentos
    .map((p) => String(p?.observacao ?? p?.forma_pagamento ?? "Pagar na entrega"))
    .filter(Boolean);

  return {
    delivery_id: String(d?.id ?? ""),
    order_number: String(d?.order_number ?? ""),
    customer_name: String(d?.customer_name ?? ""),
    total_value: Number(d?.total_value ?? 0),
    products_value: productsValue,
    services_value: servicesValue,
    forecast_value: forecastValue,
    payment_notes: paymentNotes,
  };
}
