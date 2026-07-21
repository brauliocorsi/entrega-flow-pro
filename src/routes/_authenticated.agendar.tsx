import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { fetchOrder, listAvailableOrders, type FetchOrderResult } from "@/lib/gestaoclick.functions";
import { scheduleDelivery, transferDeliveryToRoute } from "@/lib/deliveries.functions";
import { supabase } from "@/integrations/supabase/client";
import { listRoutes } from "@/lib/routes.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { formatEUR, formatDatePT, zipPrefix } from "@/lib/format";
import { DELIVERY_TYPE_LABEL, ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, WEEKDAYS_PT, AVAILABLE_SITUATIONS } from "@/lib/constants";
import { AlertCircle, Search, ArrowRight, ArrowLeft, CheckCircle2, User, Package, Wrench, Truck, Sparkles, Mail, Phone, MapPin, FileText, ChevronDown, ChevronUp, RefreshCw, CalendarClock, Users, X } from "lucide-react";

const CLUSTER_COLORS = [
  { dot: "bg-blue-500", ring: "ring-blue-300", badge: "bg-blue-100 text-blue-800 border-blue-200" },
  { dot: "bg-emerald-500", ring: "ring-emerald-300", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { dot: "bg-amber-500", ring: "ring-amber-300", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  { dot: "bg-rose-500", ring: "ring-rose-300", badge: "bg-rose-100 text-rose-800 border-rose-200" },
  { dot: "bg-violet-500", ring: "ring-violet-300", badge: "bg-violet-100 text-violet-800 border-violet-200" },
  { dot: "bg-cyan-500", ring: "ring-cyan-300", badge: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  { dot: "bg-orange-500", ring: "ring-orange-300", badge: "bg-orange-100 text-orange-800 border-orange-200" },
  { dot: "bg-teal-500", ring: "ring-teal-300", badge: "bg-teal-100 text-teal-800 border-teal-200" },
  { dot: "bg-fuchsia-500", ring: "ring-fuchsia-300", badge: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200" },
];
const cp2 = (zip?: string | null) => {
  const p = zipPrefix(zip);
  return p ? p.slice(0, 2) : null;
};

const searchSchema = z.object({ routeId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/agendar")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AgendarPage,
});

function AgendarPage() {
  const search = useSearch({ from: "/_authenticated/agendar" });
  const navigate = useNavigate();
  const fetchOrderFn = useServerFn(fetchOrder);
  const scheduleFn = useServerFn(scheduleDelivery);
  const transferFn = useServerFn(transferDeliveryToRoute);
  const listRoutesFn = useServerFn(listRoutes);
  const listAvailableFn = useServerFn(listAvailableOrders);
  const [tab, setTab] = useState<"numero" | "disponiveis">("numero");
  const [availQuery, setAvailQuery] = useState("");
  const [availSituations, setAvailSituations] = useState<string[]>(AVAILABLE_SITUATIONS);
  const [loadingRow, setLoadingRow] = useState<string | null>(null);
  const [confirmReschedule, setConfirmReschedule] = useState(false);

  const [step, setStep] = useState(1);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderData, setOrderData] = useState<FetchOrderResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"entrega" | "levantamento" | "recolha" | "troca">("entrega");
  const [minutes, setMinutes] = useState(30);
  const [volume, setVolume] = useState(2);
  const [notes, setNotes] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(search.routeId ?? null);
  const [obsOpen, setObsOpen] = useState(false);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [forceConfirm, setForceConfirm] = useState(false);

  // Bulk scheduling state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkRouteId, setBulkRouteId] = useState<string | null>(null);
  const [bulkVolumePer, setBulkVolumePer] = useState(2);
  const [bulkMinutesPer, setBulkMinutesPer] = useState(30);
  const [bulkForce, setBulkForce] = useState(false);
  const [bulkShowAll, setBulkShowAll] = useState(false);

  const { data: routes = [] } = useQuery(
    queryOptions({
      queryKey: ["routes", "list"],
      queryFn: () => listRoutesFn({ data: {} }),
      enabled: step >= 3 || bulkOpen,
    }),
  );

  const availableQuery = useQuery({
    queryKey: ["gestaoclick", "available", availSituations.join(","), availQuery],
    queryFn: () =>
      listAvailableFn({
        data: { situations: availSituations, query: availQuery || undefined, limit: 50 },
      }),
    enabled: tab === "disponiveis" && step === 1,
    staleTime: 30_000,
  });

  // Cluster colors by CP2 prefix (first 2 digits) — same color = geograficamente próximos.
  const availableOrders = availableQuery.data?.orders ?? [];
  const clusterByCp2 = (() => {
    const map = new Map<string, (typeof CLUSTER_COLORS)[number]>();
    let idx = 0;
    for (const o of availableOrders) {
      const k = cp2(o.zip_code);
      if (!k) continue;
      if (!map.has(k)) {
        map.set(k, CLUSTER_COLORS[idx % CLUSTER_COLORS.length]);
        idx++;
      }
    }
    return map;
  })();
  const selectedCp2 = new Set(
    Array.from(selected)
      .map((n) => availableOrders.find((o) => o.order_number === n))
      .map((o) => cp2(o?.zip_code))
      .filter((v): v is string => !!v),
  );
  const selectedOrders = availableOrders.filter((o) => selected.has(o.order_number));

  function toggleSelected(orderNum: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(orderNum)) next.delete(orderNum);
      else next.add(orderNum);
      return next;
    });
  }

  function bulkRouteMatches(r: any, mode: "all" | "any"): boolean {
    const prefs: string[] = (r.zip_prefixes ?? []).filter(Boolean);
    if (prefs.length === 0) return true;
    const testZip = (zip: string) => {
      const cpNum = Number(zip);
      for (const p of prefs) {
        const m = /^(\d{1,4})-(\d{1,4})$/.exec(p);
        if (m) {
          const lo = Math.min(Number(m[1]), Number(m[2]));
          const hi = Math.max(Number(m[1]), Number(m[2]));
          if (Number.isFinite(cpNum) && cpNum >= lo && cpNum <= hi) return true;
          continue;
        }
        if (zip.startsWith(p)) return true;
      }
      const nums = prefs.filter((p) => /^\d{4}$/.test(p)).map(Number);
      if (nums.length >= 2) {
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        if (cpNum >= min && cpNum <= max) return true;
      }
      return false;
    };
    const zips = selectedOrders
      .map((o) => zipPrefix(o.zip_code))
      .filter((z): z is string => !!z);
    if (zips.length === 0) return true;
    return mode === "all" ? zips.every(testZip) : zips.some(testZip);
  }

  async function handleBulkConfirm() {
    if (!bulkRouteId || selected.size === 0) return;
    setBulkLoading(true);
    let ok = 0;
    const errors: string[] = [];
    for (const on of Array.from(selected)) {
      try {
        const res = await fetchOrderFn({ data: { orderNumber: on } });
        const o = res.order;
        if (!o) throw new Error(res.error ?? "Sem dados");
        const zip = zipPrefix(o.zip_code);
        if (!zip) throw new Error("Sem CP");
        if (!o.address || o.address === "—") throw new Error("Sem morada");
        const vol = bulkVolumePer;
        const min = o.has_assembly && bulkMinutesPer < 60 ? 60 : bulkMinutesPer;
        if (res.existingActiveDelivery?.id) {
          await transferFn({ data: { id: res.existingActiveDelivery.id, newRouteId: bulkRouteId } });
        } else {
          await scheduleFn({
            data: {
              route_id: bulkRouteId,
              order_number: o.order_number,
              gestaoclick_id: o.internal_id ?? null,
              customer_name: o.customer_name,
              address: o.address,
              zip_code: o.zip_code,
              city: o.city,
              phone: o.phone,
              total_value: o.total_value,
              paid_value: o.paid_value,
              volume_m3: vol,
              delivery_type: "entrega",
              estimated_minutes: min,
              notes: null,
              rescheduled_from_id: null,
              order_payload: {
                items: o.items ?? [],
                pagamentos: o.pagamentos ?? [],
                has_assembly: o.has_assembly ?? false,
                has_delivery_service: o.has_delivery_service ?? false,
                observations: o.observations ?? null,
                status: o.status ?? null,
                date: o.date ?? null,
              },
              override_corridor: bulkForce,
            },
          });
        }
        ok++;
      } catch (e) {
        errors.push(`${on}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
    setBulkLoading(false);
    const targetRoute = bulkRouteId;
    if (ok > 0) toast.success(`${ok} entrega(s) agendada(s) em massa`);
    if (errors.length > 0) toast.error(`Falhas: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? "…" : ""}`);
    setBulkOpen(false);
    setSelected(new Set());
    availableQuery.refetch();
    if (ok > 0 && targetRoute) navigate({ to: "/rotas/$id", params: { id: targetRoute } });
  }


  async function handleScheduleFromList(orderNum: string) {
    setLoadingRow(orderNum);
    try {
      setOrderNumber(orderNum);
      const res = await fetchOrderFn({ data: { orderNumber: orderNum } });
      setOrderData(res);
      if (res.error || !res.order) {
        toast.error(res.error ?? "Não foi possível carregar a venda");
        return;
      }
      const zip = zipPrefix(res.order.zip_code);
      if (!zip) {
        toast.error(
          "Esta venda não tem código postal válido no GestãoClick. Corrige a morada do cliente antes de agendar.",
        );
        setTab("numero");
        setStep(2);
        return;
      }
      if (!res.order.address || res.order.address === "—") {
        toast.error("Esta venda não tem morada no GestãoClick. Corrige antes de agendar.");
        setTab("numero");
        setStep(2);
        return;
      }
      if (res.order.has_assembly && minutes < 60) setMinutes(60);
      setTab("numero");
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleSearch() {
    setLoading(true);
    setConfirmReschedule(false);
    try {
      const res = await fetchOrderFn({ data: { orderNumber } });
      setOrderData(res);
      if (res.error) {
        toast.error(res.error);
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  const openRoutes = routes.filter((r: any) => {
    if (["fechada", "concluida", "cheia"].includes(r.status)) return false;
    if (Number(r.current_volume_m3) + volume > Number(r.max_capacity_m3) + 0.001) return false;
    return true;
  });

  function matchesZip(r: any): boolean {
    const zip = zipPrefix(orderData?.order?.zip_code);
    const prefs: string[] = (r.zip_prefixes ?? []).filter(Boolean);
    if (prefs.length === 0 || !zip) return true;
    const cpNum = Number(zip);
    // Cada token pode ser: prefixo ("4"), CP4 exacto ("4150"), ou intervalo "a-b" (ex.: "1000-1999")
    for (const p of prefs) {
      const m = /^(\d{1,4})-(\d{1,4})$/.exec(p);
      if (m) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if (Number.isFinite(cpNum) && cpNum >= lo && cpNum <= hi) return true;
        continue;
      }
      if (zip.startsWith(p)) return true;
    }
    // Compat. antiga: 2 prefixos CP4 soltos = intervalo
    const nums = prefs.filter((p) => /^\d{4}$/.test(p)).map(Number);
    if (nums.length >= 2) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      if (cpNum >= min && cpNum <= max) return true;
    }
    return false;
  }

  const compatibleRoutes = openRoutes.filter(matchesZip);
  const otherRoutes = openRoutes.filter((r: any) => !matchesZip(r));
  const selectedRoute = openRoutes.find((r: any) => r.id === selectedRouteId);
  const selectedIsForced = selectedRoute ? !matchesZip(selectedRoute) : false;

  async function handleConfirm() {
    if (!orderData?.order || !selectedRouteId) return;
    setLoading(true);
    const tid = toast.loading("A confirmar valores no GestãoClick…");
    try {
      // Re-fetch fresh values from GestãoClick to garantir que o agendamento
      // usa o valor mais atual da venda (pagamentos COD incluídos).
      const fresh = await fetchOrderFn({ data: { orderNumber: orderData.order.order_number } });
      toast.dismiss(tid);
      if (fresh.error || !fresh.order) {
        toast.error(fresh.error ?? "Não foi possível confirmar valores");
        return;
      }
      const existing = fresh.existingActiveDelivery;
      const freshDate = (existing?.routes?.route_date as string | undefined) ?? null;
      const { data: routeRow } = await supabase
        .from("routes")
        .select("route_date")
        .eq("id", selectedRouteId)
        .maybeSingle();
      const newDate = routeRow?.route_date ?? null;
      if (existing && freshDate && newDate && freshDate === newDate) {
        toast.error(`Já está agendada para ${formatDatePT(freshDate)} nesta data. Nada a fazer.`);
        setOrderData(fresh);
        return;
      }
      const o = fresh.order;
      setOrderData(fresh);

      // Se existe entrega ativa noutra data → transferir em vez de criar
      if (existing?.id) {
        const tr = await transferFn({ data: { id: existing.id, newRouteId: selectedRouteId } });
        if (tr?.gestaoclick_synced) toast.success("Entrega transferida e sincronizada com GestãoClick");
        else if (tr?.gestaoclick_error) {
          toast.success("Entrega transferida");
          toast.warning(`GestãoClick: ${tr.gestaoclick_error}`);
        } else toast.success("Entrega transferida");
        navigate({ to: "/rotas/$id", params: { id: selectedRouteId } });
        return;
      }

      const res = await scheduleFn({
        data: {
          route_id: selectedRouteId,
          order_number: o.order_number,
          gestaoclick_id: o.internal_id ?? null,
          customer_name: o.customer_name,
          address: o.address,
          zip_code: o.zip_code,
          city: o.city,
          phone: o.phone,
          total_value: o.total_value,
          paid_value: o.paid_value,
          volume_m3: volume,
          delivery_type: type,
          estimated_minutes: minutes,
          notes: notes || null,
          rescheduled_from_id: orderData.previousUnfinished?.id ?? null,
          order_payload: {
            items: o.items ?? [],
            pagamentos: o.pagamentos ?? [],
            has_assembly: o.has_assembly ?? false,
            has_delivery_service: o.has_delivery_service ?? false,
            observations: o.observations ?? null,
            status: o.status ?? null,
            date: o.date ?? null,
          },
        },
      });
      if (res?.gestaoclick_synced) {
        toast.success("Entrega agendada e sincronizada com GestãoClick");
      } else if (res?.gestaoclick_error) {
        toast.success("Entrega agendada");
        toast.warning(`GestãoClick: ${res.gestaoclick_error}`);
      } else {
        toast.success("Entrega agendada");
      }
      navigate({ to: "/rotas/$id", params: { id: selectedRouteId } });
    } catch (e) {
      toast.dismiss(tid);
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agendar entrega</h1>
        <div className="flex gap-2 mt-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`flex-1 h-1.5 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Passo {step} de 4</p>
      </div>

      {step === 1 && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="numero">Por número</TabsTrigger>
            <TabsTrigger value="disponiveis">Disponíveis no GestãoClick</TabsTrigger>
          </TabsList>
          <TabsContent value="disponiveis" className="m-0">
            <Card className="p-5 space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px]">
                  <Label htmlFor="aq">Pesquisar</Label>
                  <Input
                    id="aq"
                    value={availQuery}
                    onChange={(e) => setAvailQuery(e.target.value)}
                    placeholder="Código, cliente, cidade, CP (4620) ou intervalo (4000-4999)"
                  />
                </div>
                <div className="flex items-end gap-2 flex-wrap">
                  {AVAILABLE_SITUATIONS.map((s) => {
                    const on = availSituations.includes(s);
                    return (
                      <Button
                        key={s}
                        size="sm"
                        variant={on ? "default" : "outline"}
                        onClick={() =>
                          setAvailSituations((cur) =>
                            cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
                          )
                        }
                      >
                        {s}
                      </Button>
                    );
                  })}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => availableQuery.refetch()}
                    disabled={availableQuery.isFetching}
                  >
                    <RefreshCw className={`h-4 w-4 ${availableQuery.isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              {availableQuery.data?.error && (
                <div className="border rounded-md p-3 bg-rose-50 border-rose-200 text-sm text-rose-800 flex gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{availableQuery.data.error}</span>
                </div>
              )}

              {selected.size > 0 && (
                <div className="rounded-md border bg-primary/5 border-primary/30 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-primary" />
                    <span><strong>{selected.size}</strong> selecionada(s)</span>
                    {selectedCp2.size > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · Zonas: {Array.from(selectedCp2).map((k) => `${k}xxx`).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      <X className="h-3 w-3 mr-1" /> Limpar
                    </Button>
                    <Button
                      size="sm"
                      disabled={selected.size < 2}
                      onClick={() => {
                        setBulkRouteId(null);
                        setBulkForce(false);
                        setBulkShowAll(false);
                        setBulkOpen(true);
                      }}
                    >
                      Agendar em massa <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="hidden md:table-cell">Cidade / CP</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="hidden sm:table-cell">Situação</TableHead>
                      <TableHead className="hidden md:table-cell">Data</TableHead>
                      <TableHead className="text-right">Acções</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableQuery.isLoading && (
                      <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">A carregar…</TableCell></TableRow>
                    )}
                    {!availableQuery.isLoading && (availableQuery.data?.orders.length ?? 0) === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">Sem vendas disponíveis.</TableCell></TableRow>
                    )}
                    {availableOrders.map((o) => {
                      const k = cp2(o.zip_code);
                      const cluster = k ? clusterByCp2.get(k) : undefined;
                      const isSelected = selected.has(o.order_number);
                      const isSuggested =
                        !isSelected && selectedCp2.size > 0 && k !== null && selectedCp2.has(k);
                      const canSelect = !o.alreadyScheduled && !!o.zip_code;
                      return (
                        <TableRow
                          key={o.order_number}
                          className={`${o.alreadyScheduled ? "opacity-60" : ""} ${
                            isSelected ? "bg-primary/5" : isSuggested ? "bg-amber-50/60" : ""
                          }`}
                        >
                          <TableCell>
                            {canSelect && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelected(o.order_number)}
                                aria-label={`Selecionar ${o.order_number}`}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {cluster ? (
                              <div className="flex items-center gap-1">
                                <span
                                  className={`inline-block h-3 w-3 rounded-full ${cluster.dot}`}
                                  title={`Zona ${k}xxx`}
                                />
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1 flex-wrap">
                              {o.customer_name}
                              {isSuggested && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                  <Sparkles className="h-3 w-3 mr-0.5" /> Perto
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {[o.city, o.zip_code].filter(Boolean).join(" · ") || (
                              <span className="text-destructive">Sem CP</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatEUR(o.total_value)}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-[10px]">{o.situation}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                            {o.date ? formatDatePT(o.date) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {o.alreadyScheduled ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                <CalendarClock className="h-3 w-3 mr-1" />
                                {o.scheduledRouteDate ? formatDatePT(o.scheduledRouteDate) : "Agendado"}
                              </Badge>
                            ) : !o.zip_code ? (
                              <Badge variant="outline" className="text-destructive border-destructive/40 text-[10px]">
                                CP em falta
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant={selected.size > 0 ? "outline" : "default"}
                                disabled={loadingRow === o.order_number}
                                onClick={() => handleScheduleFromList(o.order_number)}
                              >
                                {loadingRow === o.order_number ? "…" : "Agendar"}
                                <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <p className="text-xs text-muted-foreground">
                Marca várias encomendas com o mesmo ponto colorido (mesma zona CP) e usa <strong>Agendar em massa</strong> para criar todas na mesma rota.
              </p>
            </Card>
          </TabsContent>
          <TabsContent value="numero" className="m-0">
        <Card className="p-5 space-y-4">
          <div>
            <Label htmlFor="order">Número da encomenda (GestãoClick)</Label>
            <div className="flex gap-2 mt-1">
              <Input id="order" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="12345" />
              <Button onClick={handleSearch} disabled={loading || !orderNumber}>
                <Search className="h-4 w-4 mr-1" /> Procurar
              </Button>
            </div>
          </div>

          {orderData?.error && (
            <div className="border rounded-md p-4 bg-rose-50 border-rose-200 flex gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-rose-900">Falha ao consultar a encomenda</p>
                <p className="text-rose-700 mt-1">{orderData.error}</p>
              </div>
            </div>
          )}

          {orderData?.order && (
            <div className="space-y-3">
              <div className="border rounded-md p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{orderData.order.customer_name}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {orderData.order.has_assembly && (
                      <Badge className="bg-violet-100 text-violet-800 border-violet-200">
                        <Wrench className="h-3 w-3 mr-1" /> Montagem incluída
                      </Badge>
                    )}
                    {orderData.order.has_delivery_service && (
                      <Badge className="bg-sky-100 text-sky-800 border-sky-200">
                        <Truck className="h-3 w-3 mr-1" /> Entrega faturada
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {orderData.order.date && (
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Venda: {formatDatePT(orderData.order.date)}
                    </div>
                  )}
                  {orderData.order.status && (
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">{orderData.order.status}</Badge>
                    </div>
                  )}
                  {orderData.order.customer_document && (
                    <div className="flex items-center gap-1"><FileText className="h-3 w-3" /> {orderData.order.customer_document}</div>
                  )}
                  {orderData.order.customer_email && (
                    <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {orderData.order.customer_email}</div>
                  )}
                  {(orderData.order.mobile || orderData.order.phone) && (
                    <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {orderData.order.mobile || orderData.order.phone}</div>
                  )}
                  <div className="flex items-start gap-1 sm:col-span-2">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      {orderData.order.address}
                      {orderData.order.address_complement && `, ${orderData.order.address_complement}`}
                      {orderData.order.zip_code && ` · ${orderData.order.zip_code}`}
                      {orderData.order.city && ` ${orderData.order.city}`}
                      {orderData.order.state && ` (${orderData.order.state})`}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-1 border-t">
                  <div>Total: <strong>{formatEUR(orderData.order.total_value)}</strong></div>
                  <div className="text-muted-foreground">Pago: {formatEUR(orderData.order.paid_value)}</div>
                  {orderData.order.shipping > 0 && <div className="text-muted-foreground">Frete: {formatEUR(orderData.order.shipping)}</div>}
                  {orderData.order.discount > 0 && <div className="text-muted-foreground">Desc.: {formatEUR(orderData.order.discount)}</div>}
                  {orderData.order.remaining_value > 0 && <div className="text-rose-600">Falta: <strong>{formatEUR(orderData.order.remaining_value)}</strong></div>}
                </div>
                {orderData.order.observations && (
                  <Collapsible open={obsOpen} onOpenChange={setObsOpen} className="border-t pt-2">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                        {obsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        <span>Observações</span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="text-xs text-muted-foreground pt-1">
                        {orderData.order.observations}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>

              {orderData.order.items.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 text-xs font-medium flex items-center gap-1">
                    <Package className="h-3 w-3" /> Produtos e serviços ({orderData.order.items.length})
                  </div>
                  <div className="divide-y">
                    {orderData.order.items.map((it, i) => (
                      <div key={i} className="px-3 py-2 text-sm flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{it.description}</span>
                            {it.kind === "montagem" && <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700">Montagem</Badge>}
                            {it.kind === "entrega" && <Badge variant="outline" className="text-[10px] border-sky-300 text-sky-700">Entrega</Badge>}
                            {it.kind === "servico" && <Badge variant="outline" className="text-[10px]">Serviço</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">{it.quantity} × {formatEUR(it.price)}</div>
                        </div>
                        <div className="font-medium tabular-nums">{formatEUR(it.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(() => {
            const existing = orderData?.existingActiveDelivery;
            const gcStatus = String(orderData?.order?.status ?? "").toLowerCase();
            const gcAgendada = /agendad/.test(gcStatus) && /entrega/.test(gcStatus);
            const gcDate = orderData?.order?.delivery_date ?? null;
            const existingDate = existing?.routes?.route_date as string | undefined;
            const sameAsGc = gcAgendada && gcDate && existingDate && gcDate.slice(0, 10) === existingDate;

            if (existing && sameAsGc) {
              return (
                <div className="border rounded-md p-4 bg-emerald-50 border-emerald-200 space-y-2">
                  <div className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-emerald-900">Já agendada</p>
                      <p className="text-emerald-700 mt-1">
                        Esta encomenda já está agendada para {formatDatePT(existingDate!)} na rota <strong>{existing.routes?.zone}</strong>. Nenhuma alteração necessária.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate({ to: "/rotas/$id", params: { id: existing.route_id } })}>
                      Ver rota
                    </Button>
                    <label className="flex items-center gap-2 text-xs text-emerald-800 ml-2">
                      <input type="checkbox" checked={confirmReschedule} onChange={(e) => setConfirmReschedule(e.target.checked)} />
                      Quero alterar a data
                    </label>
                  </div>
                </div>
              );
            }

            if (existing) {
              return (
                <div className="border rounded-md p-4 bg-amber-50 border-amber-200 space-y-2">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900">Encomenda já agendada</p>
                      <p className="text-amber-700 mt-1">
                        Existe entrega ativa em {formatDatePT(existingDate!)} ({existing.routes?.zone}). Ao continuar, será <strong>transferida</strong> para a rota escolhida.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-amber-900">
                    <input type="checkbox" checked={confirmReschedule} onChange={(e) => setConfirmReschedule(e.target.checked)} />
                    Confirmo a alteração da data agendada
                  </label>
                </div>
              );
            }

            if (gcAgendada && !existing) {
              return (
                <div className="border rounded-md p-4 bg-amber-50 border-amber-200 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-900">Inconsistência detectada</p>
                    <p className="text-amber-700 mt-1">
                      O GestãoClick indica "Agendado Entrega"{gcDate ? ` para ${formatDatePT(gcDate)}` : ""}, mas não existe entrega registada no sistema. Continuar criará um novo agendamento.
                    </p>
                  </div>
                </div>
              );
            }

            return null;
          })()}

          {orderData?.previousUnfinished && (
            <div className="border rounded-md p-4 bg-amber-50 border-amber-200 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">Reagendamento</p>
                <p className="text-amber-700 mt-1">Entrega anterior {orderData.previousUnfinished.outcome} em {formatDatePT(orderData.previousUnfinished.routes?.route_date)}. Esta nova será marcada como reagendamento.</p>
              </div>
            </div>
          )}

          {(() => {
            const existing = orderData?.existingActiveDelivery;
            const gcStatus = String(orderData?.order?.status ?? "").toLowerCase();
            const gcAgendada = /agendad/.test(gcStatus) && /entrega/.test(gcStatus);
            const gcDate = orderData?.order?.delivery_date ?? null;
            const existingDate = existing?.routes?.route_date as string | undefined;
            const sameAsGc = gcAgendada && gcDate && existingDate && gcDate.slice(0, 10) === existingDate;
            const needsConfirm = (existing && sameAsGc) || (existing && !sameAsGc);
            const canContinue =
              !!orderData?.order && (!needsConfirm || confirmReschedule);
            return (
              <div className="flex justify-end">
                <Button
                  disabled={!canContinue}
                  onClick={() => {
                    if (orderData?.order?.has_assembly && minutes < 60) setMinutes(60);
                    setStep(2);
                  }}
                >
                  Continuar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            );
          })()}
        </Card>
          </TabsContent>
        </Tabs>
      )}



      {step === 2 && (
        <Card className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DELIVERY_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Volume estimado (m³)</Label>
              <Input type="number" step="0.1" min="0" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label>Tempo estimado (min)</Label>
              <Input type="number" min="5" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button onClick={() => setStep(3)}>Continuar <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-5 space-y-3">
          {(() => {
            const sortedCompat = [...compatibleRoutes].sort((a: any, b: any) =>
              a.route_date.localeCompare(b.route_date),
            );
            const bestId = sortedCompat[0]?.id ?? null;
            const sortedOther = [...otherRoutes].sort((a: any, b: any) =>
              a.route_date.localeCompare(b.route_date),
            );
            const zip = zipPrefix(orderData?.order?.zip_code);

            const renderRoute = (r: any, opts: { isBest?: boolean; forced?: boolean }) => {
              const restante = Number(r.max_capacity_m3) - Number(r.current_volume_m3);
              const pct = (Number(r.current_volume_m3) / Number(r.max_capacity_m3)) * 100;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRouteId(r.id)}
                  className={`border rounded-md p-3 cursor-pointer transition-colors ${selectedRouteId === r.id ? "border-primary bg-primary/5" : "hover:bg-accent"} ${opts.forced ? "border-amber-300" : ""}`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {r.zone}
                        <span className="text-xs text-muted-foreground font-normal">
                          {formatDatePT(r.route_date)}
                        </span>
                        {opts.isBest && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                            Recomendado
                          </Badge>
                        )}
                        {opts.forced && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                            <AlertCircle className="h-3 w-3 mr-1" /> Fora do CP
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.driver ?? "Sem motorista"} · {restante.toFixed(1)} m³ livres ({pct.toFixed(0)}% ocupado)
                      </div>
                    </div>
                    <Badge className={ROUTE_STATUS_TONE[r.status]}>{ROUTE_STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            };

            const datesCompat = Array.from(new Set(sortedCompat.map((r: any) => r.route_date)));
            const groupedCompat = datesCompat.map((date) => ({
              date,
              routes: sortedCompat.filter((r: any) => r.route_date === date),
            }));
            const datesOther = Array.from(new Set(sortedOther.map((r: any) => r.route_date)));
            const groupedOther = datesOther.map((date) => ({
              date,
              routes: sortedOther.filter((r: any) => r.route_date === date),
            }));

            return (
              <>
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      Rotas ideais ({compatibleRoutes.length}){zip && ` · CP ${zip}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Compatíveis com o código postal do cliente
                    </p>
                  </div>
                  {bestId && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                      <Sparkles className="h-3 w-3 mr-1" /> Melhor: {formatDatePT(sortedCompat[0].route_date)}
                    </Badge>
                  )}
                </div>
                {compatibleRoutes.length === 0 && (
                  <p className="text-sm text-rose-600">
                    Sem rotas ideais. Usa "Mostrar todas as rotas" abaixo para forçar uma rota fora do CP.
                  </p>
                )}
                <div className="space-y-3 max-h-[24rem] overflow-y-auto">
                  {groupedCompat.map(({ date, routes: dayRoutes }) => {
                    const d = new Date(date + "T00:00:00");
                    return (
                      <div key={date} className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                          {WEEKDAYS_PT[d.getDay()]}, {formatDatePT(date)}
                        </div>
                        {dayRoutes.map((r: any) => renderRoute(r, { isBest: r.id === bestId }))}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllRoutes((v) => !v)}
                  >
                    {showAllRoutes ? "Esconder outras rotas" : `Mostrar todas as rotas (${otherRoutes.length})`}
                  </Button>
                </div>

                {showAllRoutes && (
                  <>
                    <div className="border rounded-md p-3 bg-amber-50 border-amber-200 flex gap-2 text-xs text-amber-900">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Estas rotas <strong>não cobrem o CP</strong> do cliente. Selecionar
                        força o agendamento — usa apenas em casos excecionais.
                      </span>
                    </div>
                    <div className="space-y-3 max-h-[20rem] overflow-y-auto">
                      {groupedOther.length === 0 && (
                        <p className="text-xs text-muted-foreground">Sem outras rotas abertas.</p>
                      )}
                      {groupedOther.map(({ date, routes: dayRoutes }) => {
                        const d = new Date(date + "T00:00:00");
                        return (
                          <div key={date} className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                              {WEEKDAYS_PT[d.getDay()]}, {formatDatePT(date)}
                            </div>
                            {dayRoutes.map((r: any) => renderRoute(r, { forced: true }))}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            );
          })()}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button
              disabled={!selectedRouteId || (selectedIsForced && !forceConfirm)}
              onClick={() => setStep(4)}
            >
              Continuar <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
          {selectedIsForced && (
            <label className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={forceConfirm}
                onChange={(e) => setForceConfirm(e.target.checked)}
              />
              <span>
                Confirmo que quero <strong>forçar</strong> o agendamento na rota{" "}
                <strong>{selectedRoute?.zone}</strong> ({formatDatePT(selectedRoute?.route_date)}),
                que não cobre o CP {zipPrefix(orderData?.order?.zip_code)} deste cliente.
              </span>
            </label>
          )}
        </Card>
      )}

      {step === 4 && orderData?.order && (
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Confirmar agendamento</h3>
          {selectedIsForced && (
            <div className="border rounded-md p-3 bg-amber-50 border-amber-200 flex gap-2 text-sm text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Agendamento <strong>forçado</strong> em rota fora do CP do cliente
                ({selectedRoute?.zone} · {formatDatePT(selectedRoute?.route_date)}).
              </span>
            </div>
          )}
          <div className="text-sm space-y-1">
            <div><strong>{orderData.order.customer_name}</strong> — #{orderData.order.order_number}</div>
            <div className="text-muted-foreground">{orderData.order.address}</div>
            <div>{DELIVERY_TYPE_LABEL[type]} · {volume} m³ · {minutes} min</div>
            <div>Valor: {formatEUR(orderData.order.total_value)} {orderData.order.remaining_value > 0 && <span className="text-rose-600">(falta {formatEUR(orderData.order.remaining_value)})</span>}</div>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button onClick={handleConfirm} disabled={loading}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar
            </Button>
          </div>
        </Card>
      )}

      <div className="text-center">
        <Link to="/rotas" className="text-xs text-muted-foreground hover:text-foreground">Cancelar e voltar</Link>
      </div>

      <Dialog open={bulkOpen} onOpenChange={(v) => !bulkLoading && setBulkOpen(v)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agendar {selected.size} encomendas em massa</DialogTitle>
            <DialogDescription>
              Todas as encomendas serão agendadas na mesma rota. Volume e tempo aplicam-se a <em>cada</em> encomenda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border max-h-40 overflow-y-auto divide-y">
              {selectedOrders.map((o) => {
                const k = cp2(o.zip_code);
                const cl = k ? clusterByCp2.get(k) : undefined;
                return (
                  <div key={o.order_number} className="px-3 py-2 text-sm flex items-center gap-2">
                    {cl && <span className={`inline-block h-2.5 w-2.5 rounded-full ${cl.dot}`} />}
                    <span className="font-mono text-xs">{o.order_number}</span>
                    <span className="flex-1 truncate">{o.customer_name}</span>
                    <span className="text-xs text-muted-foreground">{o.city ?? ""} {o.zip_code ?? ""}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSelected(o.order_number)}
                      disabled={bulkLoading}
                      aria-label="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Volume por encomenda (m³)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={bulkVolumePer}
                  onChange={(e) => setBulkVolumePer(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Tempo por encomenda (min)</Label>
                <Input
                  type="number"
                  min="5"
                  value={bulkMinutesPer}
                  onChange={(e) => setBulkMinutesPer(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Totais: <strong>{(bulkVolumePer * selected.size).toFixed(2)} m³</strong> ·{" "}
              <strong>{bulkMinutesPer * selected.size} min</strong>
            </p>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Rota</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkShowAll((v) => !v)}
                  disabled={bulkLoading}
                >
                  {bulkShowAll ? "Só compatíveis" : "Mostrar todas"}
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(() => {
                  const openR = (routes as any[]).filter(
                    (r) =>
                      !["fechada", "concluida", "cheia"].includes(r.status) &&
                      Number(r.current_volume_m3) + bulkVolumePer * selected.size <=
                        Number(r.max_capacity_m3) + 0.001,
                  );
                  const list = openR
                    .map((r) => ({
                      r,
                      matchAll: bulkRouteMatches(r, "all"),
                      matchAny: bulkRouteMatches(r, "any"),
                    }))
                    .filter((x) => (bulkShowAll ? true : x.matchAny))
                    .sort((a, b) => {
                      const s = Number(b.matchAll) - Number(a.matchAll) || Number(b.matchAny) - Number(a.matchAny);
                      if (s !== 0) return s;
                      return String(a.r.route_date).localeCompare(String(b.r.route_date));
                    });
                  if (list.length === 0)
                    return <p className="text-xs text-muted-foreground">Sem rotas disponíveis.</p>;
                  return list.map(({ r, matchAll, matchAny }) => {
                    const restante = Number(r.max_capacity_m3) - Number(r.current_volume_m3);
                    return (
                      <div
                        key={r.id}
                        onClick={() => setBulkRouteId(r.id)}
                        className={`border rounded-md p-2 cursor-pointer transition-colors ${
                          bulkRouteId === r.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="min-w-0">
                            <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                              {r.zone}
                              <span className="text-xs text-muted-foreground font-normal">
                                {formatDatePT(r.route_date)}
                              </span>
                              {matchAll ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                                  <Sparkles className="h-3 w-3 mr-0.5" /> Cobre todos os CPs
                                </Badge>
                              ) : matchAny ? (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                                  Cobre alguns
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">
                                  Fora do CP
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {restante.toFixed(1)} m³ livres
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {bulkRouteId && !bulkRouteMatches((routes as any[]).find((r) => r.id === bulkRouteId), "all") && (
              <label className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={bulkForce}
                  onChange={(e) => setBulkForce(e.target.checked)}
                />
                <span>
                  Confirmo <strong>forçar</strong> agendamento em rota que não cobre todos os CPs selecionados.
                </span>
              </label>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkLoading}>
              Cancelar
            </Button>
            <Button
              onClick={handleBulkConfirm}
              disabled={
                bulkLoading ||
                !bulkRouteId ||
                selected.size < 2 ||
                (bulkRouteId != null &&
                  !bulkRouteMatches((routes as any[]).find((r) => r.id === bulkRouteId), "all") &&
                  !bulkForce)
              }
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {bulkLoading ? "A agendar…" : `Agendar ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
