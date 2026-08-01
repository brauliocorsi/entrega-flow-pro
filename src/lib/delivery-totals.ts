/**
 * Totais de uma entrega com fallback ao snapshot do GestãoClick.
 * Entregas antigas foram gravadas com total_value = 0; nesses casos usamos
 * o total do payload e, em último caso, a soma dos itens.
 */
export type DeliveryTotals = {
  productsTotal: number;
  assemblyTotal: number;
  deliveryTotal: number;
  itemsTotal: number;
  totalValue: number;
  paidValue: number;
  remainingValue: number;
  totalSource: "gc" | "payload" | "calc";
  paidSource: "gc" | "payload";
};

export function computeDeliveryTotals(d: any): DeliveryTotals {
  const payload = d?.order_payload ?? {};
  const items: any[] = Array.isArray(payload.items) ? payload.items : [];
  const sum = (arr: any[]) =>
    arr.reduce(
      (acc, i) => acc + Number(i?.total ?? Number(i?.quantity ?? 1) * Number(i?.price ?? 0)),
      0,
    );
  const productsTotal = sum(items.filter((i) => i?.kind !== "entrega" && i?.kind !== "montagem"));
  const assemblyTotal = sum(items.filter((i) => i?.kind === "montagem"));
  const deliveryTotal = sum(items.filter((i) => i?.kind === "entrega"));
  const itemsTotal = productsTotal + assemblyTotal + deliveryTotal;

  const payloadTotal = Number(payload.total_value ?? 0);
  const totalSource: "gc" | "payload" | "calc" =
    Number(d?.total_value ?? 0) > 0 ? "gc" : payloadTotal > 0 ? "payload" : "calc";
  const totalValue =
    totalSource === "gc"
      ? Number(d.total_value)
      : totalSource === "payload"
        ? payloadTotal
        : itemsTotal;

  const paidSource: "gc" | "payload" = Number(d?.paid_value ?? 0) > 0 ? "gc" : "payload";
  const paidValue =
    Number(d?.paid_value ?? 0) > 0 ? Number(d.paid_value) : Number(payload.paid_value ?? 0);

  return {
    productsTotal,
    assemblyTotal,
    deliveryTotal,
    itemsTotal,
    totalValue,
    paidValue,
    remainingValue: Math.max(totalValue - paidValue, 0),
    totalSource,
    paidSource,
  };
}
