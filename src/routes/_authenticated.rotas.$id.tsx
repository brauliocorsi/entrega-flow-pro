import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteWithDeliveries } from "@/lib/routes.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, DELIVERY_TYPE_LABEL, WEEKDAYS_PT, WAREHOUSE_ADDRESS } from "@/lib/constants";
import { formatDatePT, formatEUR } from "@/lib/format";
import { ArrowLeft, MapPin, Phone, Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rotas/$id")({
  component: RouteDetail,
});

function RouteDetail() {
  const { id } = useParams({ from: "/_authenticated/rotas/$id" });
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

  return (
    <div className="space-y-4">
      <Link to="/rotas" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Todas as rotas
      </Link>

      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold">{r.zone}</h1>
              <Badge className={ROUTE_STATUS_TONE[r.status]}>{ROUTE_STATUS_LABEL[r.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{WEEKDAYS_PT[d.getDay()]}, {formatDatePT(r.route_date)} · {r.driver ?? "Motorista por atribuir"}</p>
            <p className="text-xs text-muted-foreground mt-1">CP: {(r.zip_prefixes ?? []).join(", ") || "—"}</p>
          </div>
          <div className="flex gap-2">
            {!isClosed && (
              <Link to="/agendar" search={{ routeId: r.id }}>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Agendar entrega</Button>
              </Link>
            )}
            {!isClosed && r.deliveries_count > 0 && (
              <Link to="/rotas/$id/fechar" params={{ id: r.id }}>
                <Button size="sm" variant="outline"><CheckCircle2 className="h-4 w-4 mr-1" /> Fechar rota</Button>
              </Link>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Ocupação</span>
            <span className="font-medium">{Number(r.current_volume_m3).toFixed(1)} / {Number(r.max_capacity_m3).toFixed(1)} m³</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Ponto de partida: <span className="font-medium text-foreground">{WAREHOUSE_ADDRESS}</span>
        </div>
      </Card>

      {deliveries.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-2 border-b flex items-center justify-between flex-wrap gap-2 bg-muted/30">
            <div className="text-sm font-medium">Trajeto sugerido (Google Maps)</div>
            <a
              href={`https://www.google.com/maps/dir/${encodeURIComponent(WAREHOUSE_ADDRESS)}/${deliveries.map((d: any) => encodeURIComponent(`${d.address} ${d.zip_code ?? ""} ${d.city ?? ""}`.trim())).join("/")}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Abrir no Google Maps ↗
            </a>
          </div>
          <iframe
            title="Mapa da rota"
            className="w-full h-[360px] border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(WAREHOUSE_ADDRESS)}&daddr=${deliveries.map((d: any) => encodeURIComponent(`${d.address} ${d.zip_code ?? ""} ${d.city ?? ""}`.trim())).join("+to:")}`}
          />
        </Card>
      )}

      <h2 className="font-semibold mt-6">Entregas ({deliveries.length})</h2>
      {deliveries.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Sem entregas agendadas.</Card>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d: any) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">#{d.order_number}</span>
                    <span className="text-sm">{d.customer_name}</span>
                    <Badge variant="outline">{DELIVERY_TYPE_LABEL[d.delivery_type]}</Badge>
                    {d.outcome && <Badge variant="secondary">{d.outcome}</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3" /> {d.address} {d.zip_code ? `(${d.zip_code})` : ""}
                  </div>
                  {d.phone && (
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {d.phone}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{formatEUR(d.total_value)}</div>
                  {Number(d.remaining_value) > 0 && (
                    <div className="text-xs text-rose-600">Falta {formatEUR(d.remaining_value)}</div>
                  )}
                  <div className="text-xs text-muted-foreground">{Number(d.volume_m3).toFixed(1)} m³ · {d.estimated_minutes} min</div>
                  {d.seller_name && <div className="text-xs text-muted-foreground">{d.seller_name}</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
