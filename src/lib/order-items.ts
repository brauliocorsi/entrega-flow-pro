/** Itens e serviços de uma nota de encomenda, a partir do snapshot do GestãoClick. */
export type OrderItem = {
  name: string;
  code?: string | null;
  quantity: number;
  total: number;
  kind: "produto" | "montagem" | "entrega";
};

function itemName(it: any): string {
  return String(
    it?.name ?? it?.nome_produto ?? it?.produto?.nome ?? it?.nome ?? it?.descricao ?? "",
  ).trim();
}

function classify(it: any): OrderItem["kind"] {
  const k = String(it?.kind ?? "").toLowerCase();
  if (k === "montagem" || k === "entrega") return k;
  const n = itemName(it)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (n.includes("montagem")) return "montagem";
  if (n.includes("entrega") || n.includes("transporte")) return "entrega";
  return "produto";
}

export function orderItems(payload: any): OrderItem[] {
  const p = payload ?? {};
  const arr = p.items ?? p.produtos ?? p.itens ?? p.linhas ?? p.produtos_servicos ?? [];
  const list = Array.isArray(arr) ? arr : [arr];
  return list
    .map((it: any) => {
      const quantity = Number(it?.quantity ?? it?.quantidade ?? 1) || 1;
      const price = Number(it?.price ?? it?.valor_venda ?? it?.valor ?? 0) || 0;
      return {
        name: itemName(it),
        code: it?.code ?? it?.codigo ?? it?.produto?.codigo ?? null,
        quantity,
        total: Number(it?.total ?? quantity * price) || 0,
        kind: classify(it),
      };
    })
    .filter((i) => i.name.length > 0);
}

/** Verdadeiro quando a entrega inclui serviço de montagem. */
export function hasAssembly(payload: any): boolean {
  return orderItems(payload).some((i) => i.kind === "montagem");
}
