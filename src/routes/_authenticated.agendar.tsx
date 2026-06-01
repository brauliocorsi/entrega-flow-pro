import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { fetchOrder } from "@/lib/gestaoclick.functions";
import { scheduleDelivery } from "@/lib/deliveries.functions";
import { listRoutes } from "@/lib/routes.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDatePT, zipPrefix } from "@/lib/format";
import { DELIVERY_TYPE_LABEL, ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, WEEKDAYS_PT } from "@/lib/constants";
import { AlertCircle, Search, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";

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
  const listRoutesFn = useServerFn(listRoutes);

  const [step, setStep] = useState(1);
  const [orderNumber, setOrderNumber] = useState("");
  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"entrega" | "levantamento" | "recolha" | "troca">("entrega");
  const [minutes, setMinutes] = useState(30);
  const [volume, setVolume] = useState(2);
  const [notes, setNotes] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(search.routeId ?? null);

  const { data: routes = [] } = useQuery(
    queryOptions({
      queryKey: ["routes", "list"],
      queryFn: () => listRoutesFn({ data: {} }),
      enabled: step >= 3,
    }),
  );

  async function handleSearch() {
    setLoading(true);
    try {
      const res = await fetchOrderFn({ data: { orderNumber } });
      setOrderData(res);
      if (res.existingActiveDelivery) {
        toast.error("Esta encomenda já está agendada noutra rota");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  const compatibleRoutes = routes.filter((r: any) => {
    if (["fechada", "concluida", "cheia"].includes(r.status)) return false;
    if (Number(r.current_volume_m3) + volume > Number(r.max_capacity_m3) + 0.001) return false;
    const zip = zipPrefix(orderData?.order?.zip_code);
    if ((r.zip_prefixes ?? []).length > 0 && zip) {
      return (r.zip_prefixes as string[]).some((p) => zip.startsWith(p));
    }
    return true;
  });

  async function handleConfirm() {
    if (!orderData?.order || !selectedRouteId) return;
    setLoading(true);
    try {
      const o = orderData.order;
      await scheduleFn({
        data: {
          route_id: selectedRouteId,
          order_number: o.order_number,
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
        },
      });
      toast.success("Entrega agendada");
      navigate({ to: "/rotas/$id", params: { id: selectedRouteId } });
    } catch (e) {
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

          {orderData?.order && (
            <div className="border rounded-md p-4 bg-muted/30 space-y-2">
              <div className="font-semibold">{orderData.order.customer_name}</div>
              <div className="text-sm text-muted-foreground">{orderData.order.address} {orderData.order.zip_code ? `(${orderData.order.zip_code})` : ""}</div>
              {orderData.order.phone && <div className="text-sm text-muted-foreground">Tel: {orderData.order.phone}</div>}
              <div className="flex gap-4 text-sm pt-2">
                <div>Total: <strong>{formatEUR(orderData.order.total_value)}</strong></div>
                <div>Pago: {formatEUR(orderData.order.paid_value)}</div>
                {orderData.order.remaining_value > 0 && <div className="text-rose-600">Falta: <strong>{formatEUR(orderData.order.remaining_value)}</strong></div>}
              </div>
            </div>
          )}

          {orderData?.existingActiveDelivery && (
            <div className="border rounded-md p-4 bg-rose-50 border-rose-200 flex gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-rose-900">Encomenda já agendada</p>
                <p className="text-rose-700 mt-1">
                  Esta encomenda já está numa rota ({formatDatePT(orderData.existingActiveDelivery.routes?.route_date)} — {orderData.existingActiveDelivery.routes?.zone}). Cancela primeiro para reagendar.
                </p>
              </div>
            </div>
          )}

          {orderData?.previousUnfinished && (
            <div className="border rounded-md p-4 bg-amber-50 border-amber-200 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">Reagendamento</p>
                <p className="text-amber-700 mt-1">Entrega anterior {orderData.previousUnfinished.outcome} em {formatDatePT(orderData.previousUnfinished.routes?.route_date)}. Esta nova será marcada como reagendamento.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={!orderData?.order || !!orderData?.existingActiveDelivery} onClick={() => setStep(2)}>
              Continuar <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
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
          <p className="text-sm text-muted-foreground">
            {compatibleRoutes.length} rota(s) compatível(eis) {zipPrefix(orderData?.order?.zip_code) && `com CP ${zipPrefix(orderData?.order?.zip_code)}`}
          </p>
          {compatibleRoutes.length === 0 && <p className="text-sm text-rose-600">Sem rotas compatíveis. Tenta reduzir o volume ou contacta o admin.</p>}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {compatibleRoutes.map((r: any) => {
              const d = new Date(r.route_date + "T00:00:00");
              const restante = Number(r.max_capacity_m3) - Number(r.current_volume_m3);
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRouteId(r.id)}
                  className={`border rounded-md p-3 cursor-pointer transition-colors ${selectedRouteId === r.id ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-medium">{r.zone} <span className="text-muted-foreground font-normal">— {WEEKDAYS_PT[d.getDay()]}, {formatDatePT(r.route_date)}</span></div>
                      <div className="text-xs text-muted-foreground">{r.driver ?? "Sem motorista"} · {restante.toFixed(1)} m³ disponíveis</div>
                    </div>
                    <Badge className={ROUTE_STATUS_TONE[r.status]}>{ROUTE_STATUS_LABEL[r.status]}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button disabled={!selectedRouteId} onClick={() => setStep(4)}>Continuar <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Card>
      )}

      {step === 4 && orderData?.order && (
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Confirmar agendamento</h3>
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
