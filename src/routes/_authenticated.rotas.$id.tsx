import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteWithDeliveries } from "@/lib/routes.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, DELIVERY_TYPE_LABEL, WEEKDAYS_PT, WAREHOUSE_ADDRESS } from "@/lib/constants";
import { formatDatePT, formatEUR } from "@/lib/format";
import { ArrowLeft, MapPin, Phone, Plus, CheckCircle2, Wrench, Truck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rotas/$id")({
  component: RouteDetail,
});

function RouteDetail() {
  const { id } = useParams({ from: "/_authenticated/rotas/$id" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

      {deliveries.length > 0 && (() => {
        const stops = deliveries.map((d: any) => ({
          id: d.id,
          label: `#${d.order_number} · ${d.customer_name}`,
          full: `${d.address}${d.zip_code ? `, ${d.zip_code}` : ""}${d.city ? ` ${d.city}` : ""}`.trim(),
        }));
        const origin = encodeURIComponent(WAREHOUSE_ADDRESS);
        const fullUrl =
          `https://www.google.com/maps/dir/?api=1` +
          `&origin=${origin}` +
          `&destination=${origin}` +
          `&travelmode=driving` +
          `&waypoints=${stops.map((s) => encodeURIComponent(s.full)).join("|")}`;
        const selectedIdx = stops.findIndex((s) => s.id === selectedId);
        const selectedStop = selectedIdx >= 0 ? stops[selectedIdx] : null;
        const mapsKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;

        // Build a directions embed that draws the real driving path destino-a-destino.
        // When a stop is selected, simulate just the leg "anterior → selecionado".
        let embedSrc = "";
        if (mapsKey) {
          if (selectedStop) {
            const prev = selectedIdx === 0 ? WAREHOUSE_ADDRESS : stops[selectedIdx - 1].full;
            embedSrc =
              `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}` +
              `&origin=${encodeURIComponent(prev)}` +
              `&destination=${encodeURIComponent(selectedStop.full)}` +
              `&mode=driving`;
          } else {
            const waypoints = stops.map((s) => s.full).join("|");
            embedSrc =
              `https://www.google.com/maps/embed/v1/directions?key=${mapsKey}` +
              `&origin=${encodeURIComponent(WAREHOUSE_ADDRESS)}` +
              `&destination=${encodeURIComponent(WAREHOUSE_ADDRESS)}` +
              `&waypoints=${encodeURIComponent(waypoints)}` +
              `&mode=driving`;
          }
        } else {
          // Fallback (sem chave): apenas pinos
          embedSrc = selectedStop
            ? `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(selectedStop.full)}&z=16`
            : `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(stops.map((s) => s.full).join(" to "))}&z=11`;
        }

        return (
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2 bg-muted/30">
              <div>
              <div className="text-sm font-medium">Simulação do trajeto</div>
                <div className="text-xs text-muted-foreground">
                  {selectedStop
                    ? <>Leg {selectedIdx === 0 ? "Armazém" : `paragem ${selectedIdx}`} → <span className="font-medium text-foreground">{selectedStop.label}</span></>
                    : <>{stops.length} paragens · Armazém → entregas → Armazém</>}
                </div>
              </div>
              <div className="flex gap-2">
                {selectedStop && (
                  <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
                    Ver rota completa
                  </Button>
                )}
                <a href={fullUrl} target="_blank" rel="noreferrer">
                  <Button size="sm">
                    <MapPin className="h-4 w-4 mr-1" /> Abrir trajeto ↗
                  </Button>
                </a>
              </div>
            </div>

            <iframe
              key={selectedId ?? "all"}
              title="Mapa da rota"
              className="w-full h-[320px] border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={embedSrc}
            />

            <ol className="divide-y">
              <li className="flex items-center gap-3 px-4 py-2 text-sm bg-emerald-50/50">
                <span className="h-6 w-6 rounded-full bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center shrink-0">A</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Partida — Armazém</div>
                  <div className="text-xs text-muted-foreground truncate">{WAREHOUSE_ADDRESS}</div>
                </div>
              </li>
              {stops.map((s, i) => {
                const isSelected = s.id === selectedId;
                return (
                  <li
                    key={s.id}
                    onClick={() => selectStop(isSelected ? null : s.id)}
                    className={`flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary/10 border-l-4 border-l-primary pl-3"
                        : "hover:bg-muted/40 border-l-4 border-l-transparent pl-3"
                    }`}
                  >
                    <span
                      className={`h-6 w-6 rounded-full text-xs font-bold inline-flex items-center justify-center shrink-0 transition-transform ${
                        isSelected
                          ? "bg-primary text-primary-foreground scale-110 ring-2 ring-primary/30"
                          : "bg-primary/80 text-primary-foreground"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`truncate ${isSelected ? "font-semibold" : "font-medium"}`}>{s.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.full}</div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.full)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Ver ↗
                    </a>
                  </li>
                );
              })}
              <li className="flex items-center gap-3 px-4 py-2 text-sm bg-emerald-50/50">
                <span className="h-6 w-6 rounded-full bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center shrink-0">B</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">Regresso — Armazém</div>
                  <div className="text-xs text-muted-foreground truncate">{WAREHOUSE_ADDRESS}</div>
                </div>
              </li>
            </ol>
          </Card>
        );
      })()}

      <h2 className="font-semibold mt-6">Entregas ({deliveries.length})</h2>
      {deliveries.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Sem entregas agendadas.</Card>
      ) : (
        <div className="space-y-2">
          {deliveries.map((d: any) => {
            const payload = d.order_payload ?? {};
            const items: any[] = Array.isArray(payload.items) ? payload.items : [];
            const hasAssembly =
              payload.has_assembly === true ||
              items.some((i) => i?.kind === "montagem") ||
              (d.notes && /montagem|montar|instala/i.test(d.notes));
            const accent = hasAssembly
              ? "border-l-violet-500 bg-violet-50/40"
              : "border-l-sky-500 bg-sky-50/30";
            const productItems = items.filter((i) => i?.kind !== "entrega");
            const totalQty = productItems.reduce((acc, i) => acc + Number(i?.quantity ?? 0), 0);
            const preview = productItems.slice(0, 3);
            const extraCount = Math.max(0, productItems.length - preview.length);
            const locality = [d.city, d.zip_code].filter(Boolean).join(" · ");

            const isSelected = d.id === selectedId;
            return (
              <Card
                key={d.id}
                id={`delivery-${d.id}`}
                onClick={() => setSelectedId(isSelected ? null : d.id)}
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

                    {productItems.length > 0 && (
                      <div className="mt-2 rounded-md border bg-background/70 p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Produtos ({productItems.length}
                          {totalQty ? ` · ${totalQty} un.` : ""})
                        </div>
                        <ul className="text-xs space-y-0.5">
                          {preview.map((it, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-muted-foreground tabular-nums w-8 shrink-0">
                                {Number(it?.quantity ?? 1)}×
                              </span>
                              <span className="truncate">{it?.description ?? "Produto"}</span>
                            </li>
                          ))}
                          {extraCount > 0 && (
                            <li className="text-[11px] text-muted-foreground">
                              + {extraCount} item(s)…
                            </li>
                          )}
                        </ul>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
