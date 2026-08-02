import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { suggestDeliveryRemoval } from "@/lib/courier.functions";
import { releaseDeliveryFromRoute } from "@/lib/deliveries.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTimePT } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

/**
 * Sugestões de remoção feitas pelo entregador durante a revisão da rota.
 * As sugestões nunca alteram a rota — só o admin/logística decide.
 */
export function CourierSuggestionsPanel({
  routeId,
  deliveries,
  locked,
}: {
  routeId: string;
  deliveries: any[];
  locked?: boolean;
}) {
  const qc = useQueryClient();
  const suggestFn = useServerFn(suggestDeliveryRemoval);
  const releaseFn = useServerFn(releaseDeliveryFromRoute);

  const flagged = deliveries.filter((d) => d.removal_suggested_at);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["route", routeId] });
    qc.invalidateQueries({ queryKey: ["route-deliveries", routeId] });
    qc.invalidateQueries({ queryKey: ["scheduled-deliveries", routeId] });
    qc.invalidateQueries({ queryKey: ["routes"] });
  }

  const ignoreMut = useMutation({
    mutationFn: (id: string) => suggestFn({ data: { delivery_id: id, suggest: false } }),
    onSuccess: () => {
      toast.success("Sugestão ignorada");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => releaseFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Entrega retirada da rota");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao retirar a entrega"),
  });

  if (flagged.length === 0) return null;

  return (
    <Card className="p-4 space-y-3 border-amber-500/40">
      <div className="text-sm font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" /> Sugestões do entregador ({flagged.length})
      </div>
      <div className="space-y-2">
        {flagged.map((d) => (
          <div
            key={d.id}
            className="rounded-md border p-3 text-sm flex flex-wrap items-start justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">
                #{d.order_number} · {d.customer_name}
              </div>
              <div className="text-xs text-muted-foreground truncate">{d.address}</div>
              {d.removal_reason && (
                <div className="text-xs mt-1">
                  Motivo: <span className="font-medium">{d.removal_reason}</span>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {d.removal_suggested_by_name ?? "Entregador"} ·{" "}
                {formatDateTimePT(d.removal_suggested_at)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                disabled={ignoreMut.isPending}
                onClick={() => ignoreMut.mutate(d.id)}
              >
                Ignorar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={locked || removeMut.isPending}
                onClick={() => removeMut.mutate(d.id)}
              >
                Retirar da rota
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
