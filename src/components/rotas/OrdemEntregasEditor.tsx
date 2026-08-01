import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { reorderDeliveries } from "@/lib/routes.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, GripVertical, Lock, Save } from "lucide-react";

type Item = { id: string; order_number: string; customer_name: string; address?: string | null };

/**
 * Ordem manual das entregas de uma rota (arrastar ou setas).
 * Fica bloqueada assim que a rota é iniciada — exceto para admin/logística.
 */
export function OrdemEntregasEditor({
  routeId,
  deliveries,
  locked,
  invalidateKeys = [],
}: {
  routeId: string;
  deliveries: Item[];
  locked: boolean;
  invalidateKeys?: string[][];
}) {
  const qc = useQueryClient();
  const reorderFn = useServerFn(reorderDeliveries);
  const [items, setItems] = useState<Item[]>(deliveries);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    setItems(deliveries);
  }, [deliveries]);

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
          <Button size="sm" className="h-8" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
            <Save className="h-3.5 w-3.5 mr-1" /> Guardar ordem
          </Button>
        )}
      </div>

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
