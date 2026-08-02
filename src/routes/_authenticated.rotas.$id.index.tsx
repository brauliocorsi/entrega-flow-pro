import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteSimulation, getRouteWithDeliveries, listRoutes, updateRouteFleet, updateRouteDate } from "@/lib/routes.functions";
import { getRouteCash } from "@/lib/cash.functions";
import { listVehicles, listStaff } from "@/lib/fleet.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  updateDeliveryMeta,
  refreshDeliveryPayload,
  releaseDeliveryFromRoute,
  transferDeliveryToRoute,
} from "@/lib/deliveries.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, DELIVERY_TYPE_LABEL, WEEKDAYS_PT, WAREHOUSE_ADDRESS } from "@/lib/constants";
import { formatDatePT, formatEUR } from "@/lib/format";
import { RouteCashPanel } from "@/components/rotas/RouteCashPanel";
import { OrdemEntregasEditor } from "@/components/rotas/OrdemEntregasEditor";
import { RouteLockPanel } from "@/components/rotas/RouteLockPanel";
import { CourierSuggestionsPanel } from "@/components/rotas/CourierSuggestionsPanel";
import { RouteSimulationSection, buildStopAddress, type Stop } from "@/components/rotas/RouteSimulationSection";

import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, Plus, CheckCircle2, Wrench, Truck, Route as RouteIcon, ChevronDown, Package, Pencil, Save, X, RefreshCw, ArrowRightLeft, Trash2, Wallet, Download, History as HistoryIcon, AlertTriangle } from "lucide-react";

/** Etiqueta de origem do valor: GestãoClick vs calculado nesta app. */
function SourceTag({ kind }: { kind: "gc" | "payload" | "calc" }) {
  const map = {
    gc: { label: "GC", title: "Valor gravado, vindo do GestãoClick", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    payload: { label: "GC", title: "Valor do último snapshot do GestãoClick", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    calc: { label: "Σ", title: "Calculado nesta app a partir dos itens", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  } as const;
  const m = map[kind];
  return (
    <span
      title={m.title}
      className={`inline-flex items-center rounded border px-1 text-[9px] leading-4 font-medium ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

import { generateRouteForecast, listRouteForecasts } from "@/lib/forecasts.functions";
import { downloadForecastPdf } from "@/lib/forecast-pdf";
import { formatDateTimePT } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";



export const Route = createFileRoute("/_authenticated/rotas/$id/")({
  component: RouteDetail,
});

function RouteDetail() {
  const { id } = useParams({ from: "/_authenticated/rotas/$id/" });
  const { role } = useAuth();
  const canForecast = role === "admin" || role === "logistico";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Ordem que o utilizador está a editar (ainda não guardada) — alimenta a simulação em tempo real.
  const [previewOrder, setPreviewOrder] = useState<string[]>([]);
  const selectStop = (next: string | null) => {
    setSelectedId(next);
    if (next && typeof document !== "undefined") {
      requestAnimationFrame(() => {
        document.getElementById(`delivery-${next}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  };
  const fn = useServerFn(getRouteWithDeliveries);
  const { data, isLoading } = useQuery(
    queryOptions({
      queryKey: ["route", id],
      queryFn: () => fn({ data: { id } }),
    }),
  );

  if (isLoading) return <div className="text-muted-foreground">A carregar…</div>;
  if (!data) return <div>Rota não encontrada</div>;

  const { route: r, deliveries } = data;
  const pct = Math.min(100, (Number(r.current_volume_m3) / Number(r.max_capacity_m3)) * 100);
  const d = new Date(r.route_date + "T00:00:00");
  const isClosed = r.status === "fechada" || r.status === "concluida";
  const conferred = !!(r as any).conferred_at;
  const closedByCourier = r.status === "concluida" && !conferred;
  const canClose = canForecast && !conferred && r.deliveries_count > 0;

  const activeDeliveries = deliveries.filter(
    (dd: any) => !["cancelado", "reagendado"].includes(dd.status),
  );
  const historyDeliveries = deliveries.filter((dd: any) =>
    ["cancelado", "reagendado"].includes(dd.status),
  );
  const doneCount = activeDeliveries.filter((dd: any) => dd.status === "entregue").length;

  const baseStops: Stop[] = activeDeliveries.map((dd: any) => ({
    id: dd.id,
    label: `#${dd.order_number} · ${dd.customer_name}`,
    full: buildStopAddress(dd.address, dd.zip_code, dd.city),
  }));
  const rawStops: Stop[] =
    previewOrder.length > 0
      ? [
          ...previewOrder
            .map((sid) => baseStops.find((s) => s.id === sid))
            .filter((s): s is Stop => !!s),
          ...baseStops.filter((s) => !previewOrder.includes(s.id)),
        ]
      : baseStops;
  const savedManualOrder = activeDeliveries.some((dd: any) => dd.stop_order != null);
  const previewDiffers =
    previewOrder.length > 0 &&
    previewOrder.join(",") !== baseStops.map((s) => s.id).join(",");
  const manualOrder = savedManualOrder || previewDiffers;


  return (
    <div className="space-y-4 pb-24">
      {canClose && <CloseRouteBar routeId={r.id} pendingConference={closedByCourier} />}
      <Link to="/rotas" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Todas as rotas
      </Link>

      {closedByCourier && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Rota fechada pelo entregador
            {(r as any).closed_by_name ? ` (${(r as any).closed_by_name})` : ""}
            {(r as any).closed_at
              ? ` em ${new Date((r as any).closed_at).toLocaleString("pt-PT")}`
              : ""}{" "}
            — aguarda conferência do administrador.
          </span>
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold">{r.zone}</h1>
              <Badge className={ROUTE_STATUS_TONE[r.status]}>{ROUTE_STATUS_LABEL[r.status]}</Badge>
              {closedByCourier && (
                <Badge variant="outline" className="border-amber-400 text-amber-800">
                  Fechada pelo entregador · por conferir
                </Badge>
              )}
              {conferred && (
                <Badge variant="outline" className="border-emerald-400 text-emerald-800">
                  Conferida
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>{WEEKDAYS_PT[d.getDay()]}, {formatDatePT(r.route_date)}</span>
              <RouteDateEditor route={r} />
              <span>· {r.driver ?? "Motorista por atribuir"}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">CP: {(r.zip_prefixes ?? []).join(", ") || "—"}</p>
          </div>
          <div className="flex gap-2">
            {canForecast && <ForecastButton routeId={r.id} />}
            {canForecast && <ForecastHistoryButton routeId={r.id} />}
            {!isClosed && (
              <Link to="/agendar" search={{ routeId: r.id }}>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Agendar entrega</Button>
              </Link>
            )}
            {canClose && (
              <Link to="/rotas/$id/fechar" params={{ id: r.id }}>
                <Button size="sm" variant="outline">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {closedByCourier ? "Conferir e fechar" : "Fechar rota"}
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Volume</span>
              <span className="font-medium">{Number(r.current_volume_m3).toFixed(1)} / {Number(r.max_capacity_m3).toFixed(1)} m³</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {(() => {
            const usedMin = deliveries
              .filter((dd: any) => !["cancelado", "reagendado"].includes(dd.status))
              .reduce((a: number, dd: any) => a + Number(dd.estimated_minutes ?? 0), 0);
            const maxMin = Number((r as any).max_minutes ?? 480);
            const tPct = Math.min(100, maxMin > 0 ? (usedMin / maxMin) * 100 : 0);
            return (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Tempo</span>
                  <span className="font-medium">{usedMin} / {maxMin} min</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${tPct >= 100 ? "bg-rose-500" : tPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${tPct}%` }} />
                </div>
              </div>
            );
          })()}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Paragens", value: String(activeDeliveries.length) },
            { label: "Entregues", value: `${doneCount}/${activeDeliveries.length}` },
            { label: "Histórico", value: String(historyDeliveries.length) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-muted/30 p-2 text-center">
              <div className="text-lg font-bold leading-tight">{s.value}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Ponto de partida: <span className="font-medium text-foreground">{WAREHOUSE_ADDRESS}</span>
        </div>
      </Card>


      <Tabs defaultValue="entregas">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="trajeto">Trajeto</TabsTrigger>
          <TabsTrigger value="caixa">Caixa</TabsTrigger>
          <TabsTrigger value="equipa">Equipa</TabsTrigger>
        </TabsList>

        <TabsContent value="entregas" className="mt-3 space-y-3">
          {activeDeliveries.length > 0 && (
            <>
              <RouteLockPanel route={r} />
              <CourierSuggestionsPanel
                routeId={r.id}
                deliveries={activeDeliveries}
                locked={!!r.started_at}
              />
              <OrdemEntregasEditor
                routeId={r.id}
                deliveries={activeDeliveries.map((dd: any) => ({
                  id: dd.id,
                  order_number: dd.order_number,
                  customer_name: dd.customer_name,
                  address: dd.address,
                  zip_code: dd.zip_code,
                }))}
                locked={!!r.started_at}
                changedByName={r.order_changed_by_name}
                changedAt={r.order_changed_at}
                invalidateKeys={[["route-deliveries", r.id], ["scheduled-deliveries", r.id]]}
                onOrderChange={setPreviewOrder}
              />
            </>
          )}

          <div className="space-y-2">
            {activeDeliveries.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">Sem entregas ativas.</Card>
            ) : (
              activeDeliveries.map((dd: any) => (
                <DeliveryCard
                  key={dd.id}
                  d={dd}
                  routeId={id}
                  isSelected={dd.id === selectedId}
                  onSelect={() => setSelectedId(dd.id === selectedId ? null : dd.id)}
                  isClosed={isClosed}
                />
              ))
            )}
          </div>

          {historyDeliveries.length > 0 && (
            <details className="rounded-xl border border-border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Histórico ({historyDeliveries.length}) — removidas e reagendadas
              </summary>
              <div className="mt-3 space-y-2">
                {historyDeliveries.map((dd: any) => (
                  <Card key={dd.id} className="p-4 border-l-4 border-l-muted-foreground/30 bg-muted/20 opacity-80">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">#{dd.order_number}</span>
                          <span className="text-sm">{dd.customer_name}</span>
                          <Badge variant="outline">{DELIVERY_TYPE_LABEL[dd.delivery_type]}</Badge>
                          <Badge variant="secondary">
                            {dd.status === "cancelado" ? "Removida" : "Reagendada"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{dd.address}</span>
                        </div>
                        {dd.outcome_notes && (
                          <div className="text-xs text-muted-foreground mt-1">Notas: {dd.outcome_notes}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0 text-xs text-muted-foreground">
                        {dd.seller_name && <div>{dd.seller_name}</div>}
                        <div>{Number(dd.volume_m3).toFixed(1)} m³ · {dd.estimated_minutes} min</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </details>
          )}
        </TabsContent>

        <TabsContent value="trajeto" className="mt-3">
          {activeDeliveries.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Sem entregas ativas para simular o trajeto.
            </Card>
          ) : (
            <RouteSimulationSection
              rawStops={rawStops}
              manualOrder={manualOrder}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              selectStop={selectStop}
            />
          )}
        </TabsContent>

        <TabsContent value="caixa" className="mt-3">
          <RouteCashPanel routeId={r.id} />
        </TabsContent>

        <TabsContent value="equipa" className="mt-3">
          <Card className="p-4">
            <FleetEditor route={r} />
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}


function DeliveryCard({
  d,
  routeId,
  isSelected,
  onSelect,
  isClosed,
}: {
  d: any;
  routeId: string;
  isSelected: boolean;
  onSelect: () => void;
  isClosed: boolean;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateDeliveryMeta);
  const refreshFn = useServerFn(refreshDeliveryPayload);
  const releaseFn = useServerFn(releaseDeliveryFromRoute);
  const transferFn = useServerFn(transferDeliveryToRoute);
  const listRoutesFn = useServerFn(listRoutes);
  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { id: d.id } }),
    onSuccess: (r: any) => {
      toast.success(`Produtos atualizados (${r?.items ?? 0} itens)`);
      qc.invalidateQueries({ queryKey: ["route", routeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });
  const [productsOpen, setProductsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [volume, setVolume] = useState(String(d.volume_m3 ?? 0));
  const [minutes, setMinutes] = useState(String(d.estimated_minutes ?? 30));
  const [transferOpen, setTransferOpen] = useState(false);
  const [targetRouteId, setTargetRouteId] = useState<string>("");
  const [releaseOpen, setReleaseOpen] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const { data: availableRoutes } = useQuery({
    queryKey: ["available-routes", today],
    enabled: transferOpen,
    queryFn: () => listRoutesFn({ data: { from: today } }),
  });

  const release = useMutation({
    mutationFn: () => releaseFn({ data: { id: d.id } }),
    onSuccess: (r: any) => {
      if (r?.gestaoclick_synced) toast.success("Entrega removida e disponível para reagendar");
      else toast.success("Entrega removida da rota", { description: r?.gestaoclick_error ?? "GestãoClick não atualizado" });
      setReleaseOpen(false);
      qc.invalidateQueries({ queryKey: ["route", routeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  const transfer = useMutation({
    mutationFn: () => transferFn({ data: { id: d.id, newRouteId: targetRouteId } }),
    onSuccess: (r: any) => {
      toast.success("Entrega transferida", {
        description: r?.gestaoclick_synced ? undefined : r?.gestaoclick_error ?? "GestãoClick não atualizado",
      });
      setTransferOpen(false);
      setTargetRouteId("");
      qc.invalidateQueries({ queryKey: ["route", routeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao transferir"),
  });


  const payload = d.order_payload ?? {};
  const items: any[] = Array.isArray(payload.items) ? payload.items : [];
  const assemblyItems = items.filter((i) => i?.kind === "montagem");
  const hasAssembly =
    payload.has_assembly === true ||
    assemblyItems.length > 0 ||
    (d.notes && /montagem|montar|instala/i.test(d.notes));
  const productItems = items.filter((i) => i?.kind !== "entrega" && i?.kind !== "montagem");
  const deliveryItems = items.filter((i) => i?.kind === "entrega");
  const sum = (arr: any[]) =>
    arr.reduce(
      (acc, i) => acc + Number(i?.total ?? Number(i?.quantity ?? 1) * Number(i?.price ?? 0)),
      0,
    );
  const productsTotal = sum(productItems);
  const assemblyTotal = sum(assemblyItems);
  const deliveryTotal = sum(deliveryItems);
  const itemsTotal = productsTotal + assemblyTotal + deliveryTotal;
  // Entregas antigas foram gravadas sem totais: cair para a soma dos itens.
  const payloadTotal = Number(payload.total_value ?? 0);
  const totalSource: "gc" | "payload" | "calc" =
    Number(d.total_value) > 0 ? "gc" : payloadTotal > 0 ? "payload" : "calc";
  const totalValue =
    totalSource === "gc" ? Number(d.total_value) : totalSource === "payload" ? payloadTotal : itemsTotal;
  const paidSource: "gc" | "payload" = Number(d.paid_value) > 0 ? "gc" : "payload";
  const paidValue = Number(d.paid_value) > 0 ? Number(d.paid_value) : Number(payload.paid_value ?? 0);
  const remainingValue = Math.max(totalValue - paidValue, 0);
  // Discrepância entre o total registado e a soma dos itens
  const totalMismatch =
    itemsTotal > 0 && totalSource !== "calc" && Math.abs(itemsTotal - totalValue) > 0.01;

  const totalQty = productItems.reduce((acc, i) => acc + Number(i?.quantity ?? 0), 0);
  const accent = hasAssembly
    ? "border-l-violet-500 bg-violet-50/40"
    : "border-l-sky-500 bg-sky-50/30";
  const locality = [d.city, d.zip_code].filter(Boolean).join(" · ");


  const save = useMutation({
    mutationFn: async () => {
      const v = Number(volume.replace(",", "."));
      const m = Number(minutes);
      if (!Number.isFinite(v) || v < 0) throw new Error("Volume inválido");
      if (!Number.isInteger(m) || m < 5) throw new Error("Tempo inválido (min. 5)");
      return updateFn({ data: { id: d.id, volume_m3: v, estimated_minutes: m } });
    },
    onSuccess: () => {
      toast.success("Entrega atualizada");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["route", routeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });

  return (
    <Card
      id={`delivery-${d.id}`}
      onClick={onSelect}
      className={`p-4 border-l-4 ${accent} cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-primary shadow-lg scale-[1.01]" : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">#{d.order_number}</span>
            <span className="text-sm">{d.customer_name}</span>
            <Badge variant="outline">{DELIVERY_TYPE_LABEL[d.delivery_type]}</Badge>
            {hasAssembly ? (
              <Badge className="bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-100">
                <Wrench className="h-3 w-3 mr-1" /> Montagem
              </Badge>
            ) : (
              <Badge className="bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100">
                <Truck className="h-3 w-3 mr-1" /> Só entrega
              </Badge>
            )}
            {d.outcome && <Badge variant="secondary">{d.outcome}</Badge>}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {d.address}
              {locality ? ` — ${locality}` : ""}
            </span>
          </div>
          {d.phone && (
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {d.phone}
            </div>
          )}

          {true && (

            <Collapsible open={productsOpen} onOpenChange={setProductsOpen}>
              <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 gap-2 text-xs"
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>
                    {productItems.length} produto(s)
                    {totalQty ? ` · ${totalQty} un.` : ""}
                    {assemblyItems.length > 0 ? ` · ${assemblyItems.length} montagem` : ""}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${productsOpen ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent
                onClick={(e) => e.stopPropagation()}
                className="mt-2 rounded-md border bg-background/70 p-2"
              >
                {productItems.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                      Produtos
                    </div>
                    <ul className="text-xs space-y-0.5">
                      {productItems.map((it, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="text-muted-foreground tabular-nums w-8 shrink-0">
                            {Number(it?.quantity ?? 1)}×
                          </span>
                          <span className="flex-1">{it?.description ?? "Produto"}</span>
                          <span className="tabular-nums whitespace-nowrap">
                            {formatEUR(
                              Number(it?.total ?? Number(it?.quantity ?? 1) * Number(it?.price ?? 0)),
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {assemblyItems.length > 0 && (
                  <div className={productItems.length > 0 ? "mt-2 pt-2 border-t" : ""}>
                    <div className="text-[10px] uppercase tracking-wide text-violet-700 mb-1 flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> Montagem
                    </div>
                    <ul className="text-xs space-y-0.5">
                      {assemblyItems.map((it, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="text-muted-foreground tabular-nums w-8 shrink-0">
                            {Number(it?.quantity ?? 1)}×
                          </span>
                          <span className="flex-1">{it?.description ?? "Montagem"}</span>
                          <span className="tabular-nums whitespace-nowrap">
                            {formatEUR(
                              Number(it?.total ?? Number(it?.quantity ?? 1) * Number(it?.price ?? 0)),
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {deliveryItems.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-[10px] uppercase tracking-wide text-sky-700 mb-1 flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Entrega
                    </div>
                    <ul className="text-xs space-y-0.5">
                      {deliveryItems.map((it, idx) => (
                        <li key={idx} className="flex gap-2">
                          <span className="text-muted-foreground tabular-nums w-8 shrink-0">
                            {Number(it?.quantity ?? 1)}×
                          </span>
                          <span className="flex-1">{it?.description ?? "Entrega"}</span>
                          <span className="tabular-nums whitespace-nowrap">
                            {formatEUR(
                              Number(it?.total ?? Number(it?.quantity ?? 1) * Number(it?.price ?? 0)),
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {items.length > 0 && (
                  <div className="mt-2 pt-2 border-t space-y-0.5 text-xs">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        Produtos <SourceTag kind="calc" />
                      </span>
                      <span className="tabular-nums">{formatEUR(productsTotal)}</span>
                    </div>
                    {assemblyTotal > 0 && (
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground flex items-center gap-1">
                          Montagem <SourceTag kind="calc" />
                        </span>
                        <span className="tabular-nums">{formatEUR(assemblyTotal)}</span>
                      </div>
                    )}
                    {deliveryTotal > 0 && (
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground flex items-center gap-1">
                          Entrega <SourceTag kind="calc" />
                        </span>
                        <span className="tabular-nums">{formatEUR(deliveryTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center gap-2 font-semibold border-t pt-0.5">
                      <span className="flex items-center gap-1">
                        Total <SourceTag kind={totalSource} />
                      </span>
                      <span className="tabular-nums">{formatEUR(totalValue)}</span>
                    </div>
                    {totalMismatch && (
                      <div className="flex items-start gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-1 text-[11px] text-amber-800">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          Divergência: soma dos itens {formatEUR(itemsTotal)} ≠ total registado{" "}
                          {formatEUR(totalValue)} (diferença {formatEUR(Math.abs(itemsTotal - totalValue))}).
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        Pago <SourceTag kind={paidSource} />
                      </span>
                      <span className="tabular-nums text-emerald-700">{formatEUR(paidValue)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground flex items-center gap-1">
                        Por receber <SourceTag kind="calc" />
                      </span>
                      <span
                        className={`tabular-nums ${remainingValue > 0 ? "text-rose-600 font-semibold" : ""}`}
                      >
                        {formatEUR(remainingValue)}
                      </span>
                    </div>
                    <div className="pt-1 text-[10px] text-muted-foreground">
                      <span className="font-medium">GC</span> = valor vindo do GestãoClick ·{" "}
                      <span className="font-medium">Σ</span> = calculado nesta app
                    </div>
                  </div>
                )}


                {productItems.length === 0 && assemblyItems.length === 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      Sem itens guardados. Esta entrega foi agendada antes de guardarmos os produtos.
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs shrink-0"
                      disabled={refresh.isPending}
                      onClick={() => refresh.mutate()}
                    >
                      <RefreshCw className={`h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`} />
                      Buscar do GestãoClick
                    </Button>
                  </div>
                )}
                {(productItems.length > 0 || assemblyItems.length > 0) && (
                  <div className="mt-2 pt-2 border-t flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 text-[11px] text-muted-foreground"
                      disabled={refresh.isPending}
                      onClick={() => refresh.mutate()}
                    >
                      <RefreshCw className={`h-3 w-3 ${refresh.isPending ? "animate-spin" : ""}`} />
                      Atualizar do GestãoClick
                    </Button>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
        <div className="text-right shrink-0 space-y-1" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-semibold">{formatEUR(totalValue)}</div>
          {remainingValue > 0 && (
            <div className="text-xs text-rose-600">Falta {formatEUR(remainingValue)}</div>
          )}

          {editing ? (
            <div className="flex flex-col items-end gap-1.5 mt-1">
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-xs text-muted-foreground">m³</span>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="5"
                  min="5"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setEditing(false);
                    setVolume(String(d.volume_m3 ?? 0));
                    setMinutes(String(d.estimated_minutes ?? 30));
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  className="h-7 px-2"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-1.5">
              <div className="text-xs text-muted-foreground">
                {Number(d.volume_m3).toFixed(1)} m³ · {d.estimated_minutes} min
              </div>
              {!isClosed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => setEditing(true)}
                  title="Editar volume e tempo"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
          {d.seller_name && <div className="text-xs text-muted-foreground">{d.seller_name}</div>}
          {!isClosed && (
            <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-dashed">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setTransferOpen(true)}
                title="Transferir para outra rota"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                onClick={() => setReleaseOpen(true)}
                title="Remover da rota e libertar"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir entrega para outra rota</DialogTitle>
            <DialogDescription>
              #{d.order_number} · {d.customer_name} — {Number(d.volume_m3).toFixed(1)} m³ · {d.estimated_minutes} min
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {(availableRoutes ?? [])
              .filter((rt: any) => rt.id !== routeId && !["fechada", "concluida"].includes(rt.status))
              .map((rt: any) => {
                const remaining = Number(rt.max_capacity_m3) - Number(rt.current_volume_m3);
                const fits = remaining + 0.001 >= Number(d.volume_m3);
                return (
                  <button
                    key={rt.id}
                    type="button"
                    disabled={!fits}
                    onClick={() => setTargetRouteId(rt.id)}
                    className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                      targetRouteId === rt.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    } ${!fits ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{rt.zone}</div>
                      <Badge className={ROUTE_STATUS_TONE[rt.status]}>{ROUTE_STATUS_LABEL[rt.status]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDatePT(rt.route_date)} · restam {remaining.toFixed(1)} m³ {fits ? "" : "(sem espaço)"}
                    </div>
                  </button>
                );
              })}
            {(availableRoutes ?? []).filter((rt: any) => rt.id !== routeId && !["fechada", "concluida"].includes(rt.status)).length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">Sem rotas disponíveis.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button
              disabled={!targetRouteId || transfer.isPending}
              onClick={() => transfer.mutate()}
            >
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover entrega da rota?</AlertDialogTitle>
            <AlertDialogDescription>
              #{d.order_number} · {d.customer_name} será removida desta rota. No GestãoClick, a venda volta ao estado
              <span className="font-medium"> "Disponível para Entrega"</span>, sem alterar quaisquer outros dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={release.isPending}
              onClick={(e) => {
                e.preventDefault();
                release.mutate();
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function RouteDateEditor({ route }: { route: any }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const fnUpdateDate = useServerFn(updateRouteDate);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>(route.route_date);
  const [saving, setSaving] = useState(false);

  const canEdit = (role === "admin" || role === "logistico") && route.status !== "concluida";
  if (!canEdit) return null;

  async function save() {
    setSaving(true);
    try {
      await fnUpdateDate({ data: { id: route.id, route_date: date } });
      toast.success("Data da rota atualizada");
      setOpen(false);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar a data");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-xs"
        onClick={() => {
          setDate(route.route_date);
          setOpen(true);
        }}
      >
        <Pencil className="h-3 w-3 mr-1" /> Editar data
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar data da rota</DialogTitle>
            <DialogDescription>
              As entregas associadas passam a estar agendadas para a nova data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Nova data</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !date || date === route.route_date}>
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FleetEditor({ route }: { route: any }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const fnUpdate = useServerFn(updateRouteFleet);
  const fnVehicles = useServerFn(listVehicles);
  const fnStaff = useServerFn(listStaff);
  const [editing, setEditing] = useState(false);
  const [driver, setDriver] = useState<string>(route.driver ?? "");
  const [vehicle, setVehicle] = useState<string>(route.vehicle ?? "");
  const [assistant, setAssistant] = useState<string>(route.assistant ?? "");
  const [saving, setSaving] = useState(false);

  const canEdit = role === "admin" || role === "logistico";

  const { data: vehicles = [] } = useQuery({
    queryKey: ["fleet", "vehicles"],
    queryFn: () => fnVehicles(),
    enabled: editing,
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["fleet", "staff"],
    queryFn: () => fnStaff(),
    enabled: editing,
  });

  // Rotas do mesmo dia, para impedir escalar a mesma pessoa em duas rotas.
  const fnRoutes = useServerFn(listRoutes);
  const { data: sameDayRoutes = [] } = useQuery({
    queryKey: ["routes", "same-day", route.route_date],
    queryFn: () => fnRoutes({ data: { from: route.route_date, to: route.route_date } }),
    enabled: editing && !!route.route_date,
  });
  const normName = (v?: string | null) => (v ?? "").trim().toLowerCase();
  const busyByName = new Map<string, string>();
  for (const r of (sameDayRoutes as any[]) ?? []) {
    if (r.id === route.id || r.status === "concluida") continue;
    if (r.driver) busyByName.set(normName(r.driver), `motorista · ${r.zone}`);
    if (r.assistant) busyByName.set(normName(r.assistant), `auxiliar · ${r.zone}`);
  }
  const busyLabel = (name: string) => busyByName.get(normName(name)) ?? null;

  const drivers = (staff as any[]).filter((s) => s.kind === "motorista" && s.active);
  // Motoristas também podem ser escalados como auxiliares de rota.
  const assistants = (staff as any[])
    .filter((s) => s.active && s.name !== driver)
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "auxiliar" ? -1 : 1,
    );
  const activeVehicles = (vehicles as any[]).filter((v) => v.active);

  useEffect(() => {
    setDriver(route.driver ?? "");
    setVehicle(route.vehicle ?? "");
    setAssistant(route.assistant ?? "");
  }, [route.id, route.driver, route.vehicle, route.assistant]);

  async function save() {
    setSaving(true);
    try {
      await fnUpdate({ data: { id: route.id, driver: driver || null, vehicle: vehicle || null, assistant: assistant || null } });
      toast.success("Frota atualizada");
      setEditing(false);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  const NONE = "__none__";

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" /> Frota
        </div>
        {canEdit && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
        )}
      </div>
      {editing ? (
        <div className="grid sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">Motorista</label>
            <Select value={driver || NONE} onValueChange={(v) => setDriver(v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Nenhum —</SelectItem>
                {driver && !drivers.some((d) => d.name === driver) && (
                  <SelectItem value={driver}>{driver} (atual)</SelectItem>
                )}
                {drivers.map((d) => {
                  const busy = busyLabel(d.name);
                  return (
                    <SelectItem key={d.id} value={d.name} disabled={!!busy}>
                      {d.name}{busy ? ` — ocupado (${busy})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Veículo</label>
            <Select value={vehicle || NONE} onValueChange={(v) => setVehicle(v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Nenhum —</SelectItem>
                {vehicle && !activeVehicles.some((x) => labelVehicle(x) === vehicle) && (
                  <SelectItem value={vehicle}>{vehicle} (atual)</SelectItem>
                )}
                {activeVehicles.map((x) => (
                  <SelectItem key={x.id} value={labelVehicle(x)}>{labelVehicle(x)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Auxiliar</label>
            <Select value={assistant || NONE} onValueChange={(v) => setAssistant(v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Nenhum —</SelectItem>
                {assistant && !assistants.some((d) => d.name === assistant) && (
                  <SelectItem value={assistant}>{assistant} (atual)</SelectItem>
                )}
                {assistants.map((d) => {
                  const busy = busyLabel(d.name);
                  return (
                    <SelectItem key={d.id} value={d.name} disabled={!!busy}>
                      {d.name}{d.kind === "motorista" ? " (motorista)" : ""}
                      {busy ? ` — ocupado (${busy})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3 text-[11px] text-muted-foreground">
            Sem opções? Regista em <Link to="/admin/veiculos" className="underline">Veículos</Link> e <Link to="/admin/equipa" className="underline">Equipa</Link>.
          </div>
          <div className="sm:col-span-3 flex justify-end gap-2 mt-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" /> Guardar
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-muted-foreground">Motorista</div>
            <div className="font-medium">{route.driver ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Veículo</div>
            <div className="font-medium">{route.vehicle ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Auxiliar</div>
            <div className="font-medium">{route.assistant ?? "—"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function labelVehicle(v: { name: string; plate: string | null }) {
  return v.plate ? `${v.name} (${v.plate})` : v.name;
}

function ForecastButton({ routeId }: { routeId: string }) {
  const qc = useQueryClient();
  const generateFn = useServerFn(generateRouteForecast);
  const generate = useMutation({
    mutationFn: async () => {
      const tid = toast.loading("A sincronizar valores com o GestãoClick…");
      try {
        const f = await generateFn({ data: { routeId } });
        toast.dismiss(tid);
        return f;
      } catch (e) {
        toast.dismiss(tid);
        throw e;
      }
    },
    onSuccess: (f: any) => {
      const synced = f?.route_snapshot?.synced_count ?? 0;
      const errs: any[] = f?.route_snapshot?.sync_errors ?? [];
      if (errs.length > 0) {
        toast.warning(
          `Previsão gerada: ${formatEUR(f.total_forecast)} · ${synced} sincronizada(s), ${errs.length} sem atualizar`,
        );
      } else {
        toast.success(
          `Previsão gerada: ${formatEUR(f.total_forecast)} · ${synced} encomenda(s) atualizadas`,
        );
      }
      downloadForecastPdf(f);
      qc.invalidateQueries({ queryKey: ["route-forecasts", routeId] });
      qc.invalidateQueries({ queryKey: ["route", routeId] });
      qc.invalidateQueries({ queryKey: ["scheduled-deliveries", routeId] });
      qc.invalidateQueries({ queryKey: ["route-deliveries", routeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar previsão"),
  });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            aria-label="Atualizar valores e extrair previsão"
          >
            <Wallet className={`h-4 w-4 ${generate.isPending ? "animate-pulse" : ""}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Atualizar valores GestãoClick e extrair previsão</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}


function ForecastHistoryButton({ routeId }: { routeId: string }) {
  const [open, setOpen] = useState(false);
  const listFn = useServerFn(listRouteForecasts);
  const { data: forecasts } = useQuery({
    queryKey: ["route-forecasts", routeId],
    queryFn: () => listFn({ data: { routeId } }),
    enabled: open,
  });
  const list = forecasts ?? [];
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setOpen(true)}
              aria-label="Histórico de previsões"
            >
              <HistoryIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Histórico de previsões</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Histórico de previsões
            </DialogTitle>
            <DialogDescription>
              Lançamentos previstos para esta rota. Clica em PDF para extrair o documento.
            </DialogDescription>
          </DialogHeader>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Ainda não foi gerada nenhuma previsão para esta rota.
            </p>
          ) : (
            <ul className="divide-y">
              {list.map((f: any) => {
                const items: any[] = Array.isArray(f.items) ? f.items : [];
                return (
                  <li key={f.id} className="py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {formatDateTimePT(f.created_at)} · {f.generated_by_name ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {f.total_orders} encomenda(s) · Total previsto{" "}
                          <span className="font-semibold text-foreground">
                            {formatEUR(f.total_forecast)}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadForecastPdf(f)}
                        className="gap-1"
                      >
                        <Download className="h-4 w-4" /> PDF
                      </Button>
                    </div>
                    {items.length > 0 && (
                      <div className="rounded-md border bg-muted/30 divide-y">
                        {items.map((it: any) => (
                          <div
                            key={it.delivery_id}
                            className="px-3 py-1.5 text-xs flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 truncate">
                              <span className="font-medium text-foreground">
                                #{it.order_number}
                              </span>{" "}
                              · {it.customer_name}
                            </div>
                            <div className="tabular-nums font-medium">
                              {formatEUR(Number(it.forecast_value ?? 0))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Barra fixa de fecho de rota (ADM/Logística) com previsto vs realizado. */
function CloseRouteBar({ routeId, pendingConference }: { routeId: string; pendingConference?: boolean }) {
  const fnCash = useServerFn(getRouteCash);
  const { data } = useQuery({
    queryKey: ["route-cash", routeId],
    queryFn: () => fnCash({ data: { routeId } }),
  });

  const forecast = Number(data?.forecast_total ?? 0);
  const realized = Number(data?.realized_total ?? 0);
  const diff = realized - forecast;
  const ok = Math.abs(diff) < 0.01;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-4 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:pl-64">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-muted-foreground">
            Previsto <b className="text-foreground">{formatEUR(forecast)}</b>
          </span>
          <span className="text-muted-foreground">
            Realizado <b className="text-emerald-600">{formatEUR(realized)}</b>
          </span>
          <span className={ok ? "text-muted-foreground" : "text-amber-600 font-medium"}>
            Δ {formatEUR(diff)}
          </span>
        </div>
        <Link to="/rotas/$id/fechar" params={{ id: routeId }}>
          <Button size="sm">
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {pendingConference ? "Conferir e fechar" : "Fechar rota"}
          </Button>
        </Link>
      </div>
    </div>
  );
}
