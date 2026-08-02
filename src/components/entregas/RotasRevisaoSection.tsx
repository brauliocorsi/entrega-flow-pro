import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getMyReviewRoutes,
  confirmRouteAsCourier,
  suggestDeliveryRemoval,
} from "@/lib/courier.functions";
import { OrdemEntregasEditor } from "@/components/rotas/OrdemEntregasEditor";
import {
  RouteSimulationSection,
  buildStopAddress,
  type Stop,
} from "@/components/rotas/RouteSimulationSection";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDatePT, formatDateTimePT } from "@/lib/format";
import { orderItems } from "@/lib/order-items";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Package,
  PackageX,
  Truck,
  Undo2,
  Wrench,
} from "lucide-react";


/** Rotas libertadas pelo escritório para o entregador rever antes de arrancar. */
export function RotasRevisaoSection() {
  const fn = useServerFn(getMyReviewRoutes);
  const { data, isLoading } = useQuery({
    queryKey: ["my-review-routes"],
    queryFn: () => fn(),
  });

  if (isLoading || !data || data.routes.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4" />
        <h2 className="text-base font-semibold">Rotas para revisão</h2>
        <Badge variant="secondary">{data.routes.length}</Badge>
      </div>
      {data.routes.map((r: any) => (
        <ReviewRouteCard key={r.id} route={r} />
      ))}
    </div>
  );
}

function ReviewRouteCard({ route }: { route: any }) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmRouteAsCourier);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[]>([]);

  const deliveries: any[] = route.deliveries ?? [];
  const baseStops: Stop[] = deliveries.map((d) => ({
    id: d.id,
    label: `${d.order_number} · ${d.customer_name}`,
    full: buildStopAddress(d.address, d.zip_code, d.city),
  }));
  // A sequência em edição manda no simulador, mesmo antes de gravar.
  const stops: Stop[] =
    previewOrder.length === baseStops.length
      ? (previewOrder
          .map((id) => baseStops.find((s) => s.id === id))
          .filter(Boolean) as Stop[])
      : baseStops;

  const confirmMut = useMutation({
    mutationFn: (confirmed: boolean) => confirmFn({ data: { route_id: route.id, confirmed } }),
    onSuccess: (_d, confirmed) => {
      toast.success(confirmed ? "Rota confirmada" : "Revisão reaberta");
      qc.invalidateQueries({ queryKey: ["my-review-routes"] });
      qc.invalidateQueries({ queryKey: ["my-day"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const flagged = deliveries.filter((d) => d.removal_suggested_at).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-semibold">{route.zone}</div>
          <div className="text-xs text-muted-foreground">
            {formatDatePT(route.route_date)} · {deliveries.length} paragens
          </div>
        </div>
        {route.courier_confirmed_at ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Confirmada ·{" "}
            {formatDateTimePT(route.courier_confirmed_at)}
          </Badge>
        ) : (
          <Badge variant="outline">Por rever</Badge>
        )}
      </div>

      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Podes reordenar as paragens para propor o melhor trajeto. Não podes remover entregas — se
        alguma deve sair da rota, sugere a remoção e o escritório decide.
      </div>

      {flagged > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
          {flagged} entrega(s) com sugestão de remoção enviada.
        </div>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button size="sm" variant="outline" className="w-full">
            <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Fechar revisão" : "Rever ordem e trajeto"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <OrdemEntregasEditor
            routeId={route.id}
            deliveries={deliveries}
            locked={!!route.started_at}
            changedByName={route.order_changed_by_name}
            changedAt={route.order_changed_at}
            invalidateKeys={[["my-review-routes"], ["my-day"]]}
            onOrderChange={setPreviewOrder}
            title="Ordem das entregas e sugestões"
            hint="Arrasta para definir a sequência. Se alguma entrega deve sair da rota, sugere a remoção."
            renderRowExtra={(d) => <ReviewStopExtra delivery={d} />}
          />

          {stops.length > 0 && (
            <RouteSimulationSection
              rawStops={stops}
              manualOrder={
                deliveries.some((d) => d.stop_order != null) ||
                stops.map((x) => x.id).join(",") !== baseStops.map((x) => x.id).join(",")
              }
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              selectStop={setSelectedId}
            />
          )}
        </CollapsibleContent>

      </Collapsible>

      {route.courier_confirmed_at ? (
        <Button
          size="sm"
          variant="ghost"
          className="w-full"
          disabled={confirmMut.isPending}
          onClick={() => confirmMut.mutate(false)}
        >
          <Undo2 className="h-4 w-4 mr-1" /> Reabrir revisão
        </Button>
      ) : (
        <Button
          size="sm"
          className="w-full"
          disabled={confirmMut.isPending}
          onClick={() => confirmMut.mutate(true)}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar rota (OK)
        </Button>
      )}
    </Card>
  );
}

/** Extra por paragem: estado de montagem, itens da encomenda e sugestão de remoção. */
function ReviewStopExtra({ delivery }: { delivery: any }) {
  const qc = useQueryClient();
  const suggestFn = useServerFn(suggestDeliveryRemoval);
  const [openReason, setOpenReason] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [reason, setReason] = useState("");

  const items = orderItems(delivery.order_payload);
  const montagem = items.filter((i) => i.kind === "montagem");
  const entrega = items.filter((i) => i.kind === "entrega");
  const produtos = items.filter((i) => i.kind === "produto");

  const mut = useMutation({
    mutationFn: (suggest: boolean) =>
      suggestFn({ data: { delivery_id: delivery.id, suggest, reason } }),
    onSuccess: (_d, suggest) => {
      toast.success(suggest ? "Sugestão enviada" : "Sugestão anulada");
      setOpenReason(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["my-review-routes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {montagem.length > 0 ? (
          <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px]">
            <Wrench className="h-3 w-3 mr-1" /> Com montagem
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            <PackageX className="h-3 w-3 mr-1" /> Sem montagem
          </Badge>
        )}
        {items.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => setShowItems((v) => !v)}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 mr-1 transition-transform ${showItems ? "rotate-180" : ""}`}
            />
            Itens e serviços ({items.length})
          </Button>
        )}
        {delivery.removal_suggested_at ? null : openReason ? null : (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => setOpenReason(true)}
          >
            Sugerir remoção
          </Button>
        )}
      </div>

      {showItems && items.length > 0 && (
        <ul className="rounded-md border bg-muted/30 divide-y text-xs">
          {[...produtos, ...montagem, ...entrega].map((it, idx) => (
            <li key={idx} className="flex items-center gap-2 px-2 py-1.5">
              {it.kind === "montagem" ? (
                <Wrench className="h-3.5 w-3.5 text-violet-600 shrink-0" />
              ) : it.kind === "entrega" ? (
                <Truck className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              ) : (
                <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {it.code ? <span className="font-mono mr-1">{it.code}</span> : null}
                {it.name}
              </span>
              <span className="shrink-0 text-muted-foreground">x{it.quantity}</span>
            </li>
          ))}
        </ul>
      )}

      {delivery.removal_suggested_at ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs flex items-center justify-between gap-2">
          <span>
            Remoção sugerida{delivery.removal_reason ? ` — ${delivery.removal_reason}` : ""}
          </span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => mut.mutate(false)}>
            Anular
          </Button>
        </div>
      ) : openReason ? (
        <div className="space-y-2">
          <Input
            placeholder="Motivo (ex.: fora do trajeto, cliente ausente)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-8"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-8" disabled={mut.isPending} onClick={() => mut.mutate(true)}>
              Enviar sugestão
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpenReason(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

