import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { reorderDeliveries } from "@/lib/routes.functions";
import { formatDateTimePT } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, GripVertical, Lock, Save, Route as RouteIcon } from "lucide-react";

type Item = {
  id: string;
  order_number: string;
  customer_name: string;
  address?: string | null;
  zip_code?: string | null;
  [key: string]: any;
};


/** Extrai o CP como número (CP4 + CP3, ex: "4620-695" -> 4620695). */
function zipValue(item: Item): number | null {
  const src = `${item.zip_code ?? ""} ${item.address ?? ""}`;
  const m = /(\d{4})[-\s]?(\d{3})?/.exec(src.replace(/\s+/g, " "));
  if (!m) return null;
  const cp4 = Number(m[1]);
  const cp3 = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(cp4)) return null;
  return cp4 * 1000 + cp3;
}

function dist(a: number, b: number) {
  return Math.abs(a - b);
}

/** Vizinho mais próximo + 2-opt sobre a "distância" entre códigos postais. */
function optimizeByZip(items: Item[]): Item[] {
  const withZip = items.filter((i) => zipValue(i) !== null);
  const noZip = items.filter((i) => zipValue(i) === null);
  if (withZip.length < 3) return items;

  const val = new Map(withZip.map((i) => [i.id, zipValue(i)!]));
  // Começa pelo CP mais baixo (extremo do corredor).
  const start = withZip.reduce((acc, i) => (val.get(i.id)! < val.get(acc.id)! ? i : acc), withZip[0]!);

  const remaining = withZip.filter((i) => i.id !== start.id);
  const order: Item[] = [start];
  let current = start;
  while (remaining.length) {
    let bestIdx = 0;
    let best = Infinity;
    remaining.forEach((cand, idx) => {
      const d = dist(val.get(current.id)!, val.get(cand.id)!);
      if (d < best) {
        best = d;
        bestIdx = idx;
      }
    });
    const [next] = remaining.splice(bestIdx, 1);
    if (!next) break;
    order.push(next);
    current = next;
  }

  // 2-opt para reduzir o trajeto total.
  const total = (arr: Item[]) =>
    arr.reduce((sum, it, i) => (i === 0 ? 0 : sum + dist(val.get(arr[i - 1]!.id)!, val.get(it.id)!)), 0);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (total(candidate) < total(order) - 0.0001) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  return [...order, ...noZip];
}

/**
 * Ordem manual das entregas de uma rota (arrastar ou setas).
 * Fica bloqueada assim que a rota é iniciada — exceto para admin/logística.
 */
export function OrdemEntregasEditor({
  routeId,
  deliveries,
  locked,
  invalidateKeys = [],
  onOrderChange,
  changedByName,
  changedAt,
  renderRowExtra,
  title,
  hint,
}: {
  routeId: string;
  deliveries: Item[];
  locked: boolean;
  invalidateKeys?: string[][];
  /** Notifica a ordem atual (ainda não guardada) para simulação em tempo real. */
  onOrderChange?: (ids: string[]) => void;
  /** Quem alterou a ordem pela última vez. */
  changedByName?: string | null;
  changedAt?: string | null;
  /** Conteúdo extra por linha (ex.: itens da encomenda, sugerir remoção). */
  renderRowExtra?: (item: Item, index: number) => React.ReactNode;
  title?: string;
  hint?: string;
}) {

  const qc = useQueryClient();
  const reorderFn = useServerFn(reorderDeliveries);
  const [items, setItems] = useState<Item[]>(deliveries);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const deliveriesKey = deliveries.map((d) => d.id).join(",");
  useEffect(() => {
    setItems(deliveries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveriesKey]);

  const itemsKey = items.map((i) => i.id).join(",");
  useEffect(() => {
    onOrderChange?.(itemsKey ? itemsKey.split(",") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);


  const dirty = items.map((i) => i.id).join(",") !== deliveries.map((i) => i.id).join(",");

  const saveMut = useMutation({
    mutationFn: () => reorderFn({ data: { route_id: routeId, delivery_ids: items.map((i) => i.id) } }),
    onSuccess: () => {
      toast.success("Ordem das entregas guardada");
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["route", routeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível guardar a ordem"),
  });

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [row] = next.splice(from, 1);
    if (row) next.splice(to, 0, row);
    setItems(next);
  }

  function recalc() {
    const next = optimizeByZip(items);
    const changed = next.map((i) => i.id).join(",") !== items.map((i) => i.id).join(",");
    setItems(next);
    if (changed) toast.success("Ordem recalculada por proximidade de códigos postais");
    else toast.info("A ordem atual já é a mais curta por código postal");
  }

  if (items.length === 0) return null;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-medium">Ordem das entregas</div>
          <div className="text-xs text-muted-foreground">
            {locked
              ? "Rota iniciada — a ordem já não pode ser alterada."
              : "Arrasta ou usa as setas para definir a sequência de entrega."}
          </div>
        </div>
        {locked ? (
          <Badge variant="outline" className="text-[10px]">
            <Lock className="h-3 w-3 mr-1" /> Bloqueada
          </Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8" onClick={recalc}>
              <RouteIcon className="h-3.5 w-3.5 mr-1" /> Recalcular por CP
            </Button>
            <Button size="sm" className="h-8" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Save className="h-3.5 w-3.5 mr-1" /> Guardar ordem
            </Button>
          </div>
        )}
      </div>

      {changedByName && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
          Ordem alterada por <strong>{changedByName}</strong>
          {changedAt ? ` · ${formatDateTimePT(changedAt)}` : ""}
        </div>
      )}

      <ol className="space-y-1.5">
        {items.map((d, i) => (
          <li
            key={d.id}
            draggable={!locked}
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null && dragIdx !== i) move(dragIdx, i);
              setDragIdx(null);
            }}
            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm bg-background ${
              locked ? "" : "cursor-grab active:cursor-grabbing"
            } ${dragIdx === i ? "opacity-50" : ""}`}
          >
            {!locked && <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold inline-flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">
                #{d.order_number} · {d.customer_name}
              </div>
              {d.address && <div className="text-xs text-muted-foreground truncate">{d.address}</div>}
            </div>
            {!locked && (
              <span className="flex shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, i - 1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, i + 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
