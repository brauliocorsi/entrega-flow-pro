import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { fetchOrder, type FetchOrderResult } from "@/lib/gestaoclick.functions";
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
import { formatEUR, formatDatePT, zipPrefix } from "@/lib/format";
import { DELIVERY_TYPE_LABEL, ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, WEEKDAYS_PT } from "@/lib/constants";
import { AlertCircle, Search, ArrowRight, ArrowLeft, CheckCircle2, User, Package, Wrench, Truck, Sparkles, Mail, Phone, MapPin, FileText, ChevronDown, ChevronUp } from "lucide-react";

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

  const { data: routes = [] } = useQuery(
    queryOptions({
      queryKey: ["routes", "list"],
      queryFn: () => listRoutesFn({ data: {} }),
      enabled: step >= 3,
    }),
  );

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
    </div>
  );
}
