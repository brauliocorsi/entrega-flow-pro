import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteSimulation, getRouteWithDeliveries, listRoutes, updateRouteFleet } from "@/lib/routes.functions";
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
import { toast } from "sonner";
import { ArrowLeft, MapPin, Phone, Plus, CheckCircle2, Wrench, Truck, Route as RouteIcon, ChevronDown, Package, Pencil, Save, X, RefreshCw, ArrowRightLeft, Trash2 } from "lucide-react";

type Stop = {
  id: string;
  label: string;
  full: string;
};

type RouteSimulation = {
  distanceMeters: number;
  duration: string;
  polyline: string;
  optimizedOrder?: number[];
  legs: Array<{
    distanceMeters: number;
    duration: string;
    polyline: string;
    startLocation: { lat: number; lng: number };
    endLocation: { lat: number; lng: number };
  }>;
};

function formatDuration(duration: string) {
  const totalSeconds = Number.parseInt(duration.replace("s", ""), 10) || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  if (minutes <= 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`;
  return `${distanceMeters} m`;
}

// Compõe uma morada limpa para a Routes API: remove o CP duplicado dentro do
// logradouro (ex.: "Rua X 4620-695, 83" + zip "4620-695") e garante o formato
// "<rua e número>, <CP> <cidade>".
function buildStopAddress(address: string, zip?: string | null, city?: string | null) {
  const cpRegex = /\b\d{4}-\d{3}\b/;
  const cpInAddr = address.match(cpRegex)?.[0];
  const finalZip = zip || cpInAddr || "";
  // Remove qualquer CP do logradouro e limpa vírgulas/espaços extra
  const cleanedAddr = address
    .replace(cpRegex, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
  return [cleanedAddr, [finalZip, city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ")
    .trim();
}


function RouteSimulationSection({
  rawStops,
  selectedId,
  setSelectedId,
  selectStop,
}: {
  rawStops: Stop[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectStop: (id: string | null) => void;
}) {
  const simulationFn = useServerFn(getRouteSimulation);
  const { data: optData } = useQuery<RouteSimulation>({
    queryKey: ["route-simulation", rawStops.map((s) => s.id).join(",")],
    enabled: rawStops.length > 0,
    queryFn: () =>
      simulationFn({
        data: {
          origin: WAREHOUSE_ADDRESS,
          destination: WAREHOUSE_ADDRESS,
          intermediates: rawStops.map((s) => s.full),
        },
      }),
  });

  const stops: Stop[] = useMemo(() => {
    if (optData?.optimizedOrder && optData.optimizedOrder.length === rawStops.length) {
      return optData.optimizedOrder.map((i) => rawStops[i]).filter(Boolean);
    }
    return rawStops;
  }, [rawStops, optData]);

  const legs = optData?.legs ?? [];

  const origin = encodeURIComponent(WAREHOUSE_ADDRESS);
  const fullUrl =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${origin}` +
    `&destination=${origin}` +
    `&travelmode=driving` +
    `&waypoints=${stops.map((s) => encodeURIComponent(s.full)).join("|")}`;
  const selectedIdx = stops.findIndex((s) => s.id === selectedId);
  const selectedStop: Stop | null = selectedIdx >= 0 ? stops[selectedIdx] : null;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2 bg-muted/30">
        <div>
          <div className="text-sm font-medium">Simulação do trajeto (rota mais rápida)</div>
          <div className="text-xs text-muted-foreground">
            {selectedStop ? (
              <>
                Troço {selectedIdx === 0 ? "Armazém" : `paragem ${selectedIdx}`} →{" "}
                <span className="font-medium text-foreground">{selectedStop.label}</span>
              </>
            ) : (
              <>{stops.length} paragens · Armazém → entregas → Armazém · ordem otimizada por tempo</>
            )}
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

      <RouteSimulationMap stops={stops} selectedId={selectedId} />

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
          const leg = legs[i];
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
                {leg && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {i === 0 ? "Armazém" : `Paragem ${i}`} → aqui:{" "}
                    <span className="font-medium text-foreground">{formatDistance(leg.distanceMeters)}</span>
                  </div>
                )}
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
            {legs[stops.length] && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Última paragem → Armazém:{" "}
                <span className="font-medium text-foreground">{formatDistance(legs[stops.length].distanceMeters)}</span>
              </div>
            )}
          </div>
        </li>
      </ol>
    </Card>
  );
}

function RouteSimulationMap({
  stops,
  selectedId,
}: {
  stops: Stop[];
  selectedId: string | null;
}) {
  const mapsKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const trackingId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const simulationFn = useServerFn(getRouteSimulation);

  const selectedIdx = stops.findIndex((s) => s.id === selectedId);
  const selectedStop = selectedIdx >= 0 ? stops[selectedIdx] : null;

  const simulationInput = useMemo(() => {
    if (stops.length === 0) return null;
    return {
      origin: WAREHOUSE_ADDRESS,
      destination: WAREHOUSE_ADDRESS,
      intermediates: stops.map((stop) => stop.full),
    };
  }, [stops]);

  const { data, isLoading, error } = useQuery<RouteSimulation>({
    queryKey: ["route-simulation", stops.map((s) => s.id).join(",")],
    enabled: Boolean(simulationInput),
    queryFn: () => simulationFn({ data: simulationInput! }),
  });

  useEffect(() => {
    if (!mapsKey || !mapRef.current) return;

    let cancelled = false;
    (async () => {
      const { setOptions, importLibrary } = await import("@googlemaps/js-api-loader");
      setOptions({
        key: mapsKey,
        v: "weekly",
        ...(trackingId ? { channel: trackingId } : {}),
      });
      const [mapsLib] = await Promise.all([importLibrary("maps"), importLibrary("marker")]);
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      const { Map } = mapsLib as any;
      mapInstanceRef.current = new Map(mapRef.current, {
        center: { lat: 41.1579, lng: -8.6291 },
        zoom: 10,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mapsKey, trackingId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !data) return;

    let cancelled = false;
    (async () => {
      const polylineMod = (await import("@mapbox/polyline")).default;
      if (cancelled) return;

      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];

      const decodePath = (encoded: string) =>
        polylineMod.decode(encoded).map(([lat, lng]: [number, number]) => ({ lat, lng }));

      // Compor o caminho completo a partir das polylines de cada troço — garante
      // que TODOS os troços (incluindo o regresso ao armazém) estão presentes.
      const legPaths = data.legs.map((leg) =>
        leg.polyline ? decodePath(leg.polyline) : [leg.startLocation, leg.endLocation],
      );
      const fullDecoded = legPaths.length > 0
        ? legPaths.flatMap((p, i) => (i === 0 ? p : p.slice(1)))
        : decodePath(data.polyline);

      const googleMaps = (globalThis as any).google?.maps;
      if (!googleMaps) return;

      const bounds = new googleMaps.LatLngBounds();
      fullDecoded.forEach((point: { lat: number; lng: number }) => bounds.extend(point));

      // Trajeto completo (sempre visível, incluindo regresso ao armazém)
      const fullPath = new googleMaps.Polyline({
        path: fullDecoded,
        strokeColor: selectedStop ? "#94a3b8" : "#2563eb",
        strokeOpacity: selectedStop ? 0.55 : 0.9,
        strokeWeight: selectedStop ? 4 : 5,
      });
      fullPath.setMap(map);
      overlaysRef.current.push(fullPath);

      const returnPathPoints = legPaths[legPaths.length - 1];
      if (returnPathPoints?.length) {
        const returnPath = new googleMaps.Polyline({
          path: returnPathPoints,
          strokeColor: "#059669",
          strokeOpacity: 0,
          strokeWeight: 6,
          icons: [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                strokeColor: "#059669",
                scale: 4,
              },
              offset: "0",
              repeat: "14px",
            },
            {
              icon: {
                path: googleMaps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 3,
                strokeColor: "#059669",
                fillColor: "#059669",
                fillOpacity: 1,
              },
              offset: "100%",
            },
          ],
          zIndex: 3,
        });
        returnPath.setMap(map);
        overlaysRef.current.push(returnPath);
      }

      // Marcadores: A (armazém) → 1..N (paragens) → B (regresso ao armazém)
      const points = data.legs.flatMap((leg, index) => {
        const start = index === 0 ? [leg.startLocation] : [];
        return [...start, leg.endLocation];
      });

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const warehouseOverlap =
        !!firstPoint &&
        !!lastPoint &&
        Math.abs(firstPoint.lat - lastPoint.lat) < 0.00001 &&
        Math.abs(firstPoint.lng - lastPoint.lng) < 0.00001;

      points.forEach((point: { lat: number; lng: number }, index: number) => {
        const isWarehouseStart = index === 0;
        const isWarehouseEnd = index === points.length - 1;
        const label = isWarehouseStart ? "A" : isWarehouseEnd ? "B" : String(index);
        const isSelectedMarker = !!selectedStop && index === selectedIdx + 1;
        const adjustedPoint =
          warehouseOverlap && isWarehouseEnd
            ? { lat: point.lat + 0.00035, lng: point.lng + 0.00035 }
            : point;
        const marker = new googleMaps.Marker({
          position: adjustedPoint,
          map,
          label,
          animation: isSelectedMarker ? googleMaps.Animation.BOUNCE : undefined,
        });
        overlaysRef.current.push(marker);
      });

      // Quando uma paragem está selecionada, destaca o troço com a polyline real
      if (selectedStop && legPaths[selectedIdx]) {
        const highlight = new googleMaps.Polyline({
          path: legPaths[selectedIdx],
          strokeColor: "#2563eb",
          strokeOpacity: 1,
          strokeWeight: 6,
        });
        highlight.setMap(map);
        overlaysRef.current.push(highlight);
      }

      if (!bounds.isEmpty()) {
        if (selectedStop) {
          map.fitBounds(bounds, 64);
        } else {
          map.fitBounds(bounds, 48);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, selectedStop, selectedIdx]);

  if (!mapsKey) {
    return <div className="h-[420px] grid place-items-center text-sm text-muted-foreground bg-muted/20">A chave do mapa não está disponível.</div>;
  }

  return (
    <div className="space-y-3">
      <div ref={mapRef} className="w-full h-[420px]" />
      <div className="px-4 pb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {isLoading && <span>A calcular trajeto…</span>}
        {error && <span className="text-rose-600">Não foi possível calcular o trajeto.</span>}
        {data && (
          <>
            <span className="inline-flex items-center gap-1"><RouteIcon className="h-3.5 w-3.5" /> {formatDistance(data.distanceMeters)}</span>
            <span>{formatDuration(data.duration)}</span>
            <span>{data.legs.length} troço(s)</span>
          </>
        )}
      </div>
    </div>
  );
}

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
        <div className="mt-3 text-xs text-muted-foreground">
          Ponto de partida: <span className="font-medium text-foreground">{WAREHOUSE_ADDRESS}</span>
        </div>
        <FleetEditor route={r} />
      </Card>

      {(() => {
        const activeDeliveries = deliveries.filter(
          (dd: any) => !["cancelado", "reagendado"].includes(dd.status),
        );
        const historyDeliveries = deliveries.filter((dd: any) =>
          ["cancelado", "reagendado"].includes(dd.status),
        );

        return (
          <>
            {activeDeliveries.length > 0 && (() => {
              const rawStops: Stop[] = activeDeliveries.map((d: any) => ({
                id: d.id,
                label: `#${d.order_number} · ${d.customer_name}`,
                full: buildStopAddress(d.address, d.zip_code, d.city),
              }));

              return (
                <RouteSimulationSection
                  rawStops={rawStops}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  selectStop={selectStop}
                />
              );
            })()}

            <Tabs defaultValue="ativas" className="mt-6">
              <TabsList>
                <TabsTrigger value="ativas">Ativas ({activeDeliveries.length})</TabsTrigger>
                <TabsTrigger value="historico">Histórico ({historyDeliveries.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="ativas" className="space-y-2 mt-3">
                {activeDeliveries.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">Sem entregas ativas.</Card>
                ) : (
                  activeDeliveries.map((d: any) => (
                    <DeliveryCard
                      key={d.id}
                      d={d}
                      routeId={id}
                      isSelected={d.id === selectedId}
                      onSelect={() => setSelectedId(d.id === selectedId ? null : d.id)}
                      isClosed={isClosed}
                    />
                  ))
                )}
              </TabsContent>
              <TabsContent value="historico" className="space-y-2 mt-3">
                {historyDeliveries.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">Sem marcações no histórico.</Card>
                ) : (
                  historyDeliveries.map((d: any) => (
                    <Card key={d.id} className="p-4 border-l-4 border-l-muted-foreground/30 bg-muted/20 opacity-80">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">#{d.order_number}</span>
                            <span className="text-sm">{d.customer_name}</span>
                            <Badge variant="outline">{DELIVERY_TYPE_LABEL[d.delivery_type]}</Badge>
                            <Badge variant="secondary">
                              {d.status === "cancelado" ? "Removida" : "Reagendada"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{d.address}</span>
                          </div>
                          {d.outcome_notes && (
                            <div className="text-xs text-muted-foreground mt-1">Notas: {d.outcome_notes}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-xs text-muted-foreground">
                          {d.seller_name && <div>{d.seller_name}</div>}
                          <div>{Number(d.volume_m3).toFixed(1)} m³ · {d.estimated_minutes} min</div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </>
        );
      })()}
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
                        </li>
                      ))}
                    </ul>
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
          <div className="text-sm font-semibold">{formatEUR(d.total_value)}</div>
          {Number(d.remaining_value) > 0 && (
            <div className="text-xs text-rose-600">Falta {formatEUR(d.remaining_value)}</div>
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

  const drivers = (staff as any[]).filter((s) => s.kind === "motorista" && s.active);
  const assistants = (staff as any[]).filter((s) => s.kind === "auxiliar" && s.active);
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
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                ))}
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
                {assistants.map((d) => (
                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                ))}
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
