import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteSimulation } from "@/lib/routes.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WAREHOUSE_ADDRESS } from "@/lib/constants";
import { MapPin, Route as RouteIcon } from "lucide-react";

export type Stop = {
  id: string;
  label: string;
  full: string;
};

type RouteSimulation = {
  distanceMeters: number;
  duration: string;
  polyline: string;
  error?: string;
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
export function buildStopAddress(address: string, zip?: string | null, city?: string | null) {
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


export function RouteSimulationSection({
  rawStops,
  manualOrder = false,
  selectedId,
  setSelectedId,
  selectStop,
}: {
  rawStops: Stop[];
  manualOrder?: boolean;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectStop: (id: string | null) => void;
}) {
  const simulationFn = useServerFn(getRouteSimulation);
  // Paragens sem morada utilizável rebentavam a validação e deixavam o mapa vazio.
  const validStops = useMemo(() => rawStops.filter((s) => (s.full ?? "").trim().length >= 5), [rawStops]);
  const { data: optData, isFetching: simFetching } = useQuery<RouteSimulation>({
    queryKey: [
      "route-simulation",
      validStops.map((s) => s.id).join(","),
      manualOrder ? "manual" : "auto",
    ],
    enabled: validStops.length > 0,
    queryFn: () =>
      simulationFn({
        data: {
          origin: WAREHOUSE_ADDRESS,
          destination: WAREHOUSE_ADDRESS,
          intermediates: validStops.map((s) => s.full.trim().slice(0, 255)),
          // Com ordem manual, o Google não pode reordenar as paragens.
          optimize: !manualOrder,
        },
      }),
  });


  const stops: Stop[] = useMemo(() => {
    const invalid = rawStops.filter((s) => !validStops.includes(s));
    // Com ordem manual definida, o trajeto segue essa sequência em vez da otimizada.
    if (!manualOrder && optData?.optimizedOrder && optData.optimizedOrder.length === validStops.length) {
      return [...optData.optimizedOrder.map((i) => validStops[i]).filter(Boolean), ...invalid];
    }
    return [...validStops, ...invalid];
  }, [rawStops, validStops, optData, manualOrder]);



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
              <>
                {stops.length} paragens · Armazém → entregas → Armazém ·{" "}
                {manualOrder ? "ordem manual definida" : "ordem otimizada por tempo"}
                {simFetching && " · a atualizar…"}
              </>
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

      <RouteSimulationMap stops={stops} selectedId={selectedId} manualOrder={manualOrder} />

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
  manualOrder = false,
}: {
  stops: Stop[];
  selectedId: string | null;
  manualOrder?: boolean;
}) {
  const mapsKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const trackingId = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const simulationFn = useServerFn(getRouteSimulation);

  const selectedIdx = stops.findIndex((s) => s.id === selectedId);
  const selectedStop = selectedIdx >= 0 ? stops[selectedIdx] : null;

  const mapStops = useMemo(() => stops.filter((s) => (s.full ?? "").trim().length >= 5), [stops]);

  const simulationInput = useMemo(() => {
    if (mapStops.length === 0) return null;
    return {
      origin: WAREHOUSE_ADDRESS,
      destination: WAREHOUSE_ADDRESS,
      intermediates: mapStops.map((stop) => stop.full.trim().slice(0, 255)),
      optimize: !manualOrder,
    };
  }, [mapStops, manualOrder]);

  const { data, isLoading, error } = useQuery<RouteSimulation>({
    queryKey: [
      "route-simulation",
      mapStops.map((s) => s.id).join(","),
      manualOrder ? "manual" : "auto",
    ],
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

  const noGeometry = !!data && data.legs.length === 0;
  const failureMsg =
    (error && "Não foi possível contactar o serviço de mapas.") ||
    (noGeometry && (data?.error || "Não foi possível traçar o trajeto para estas moradas.")) ||
    (mapStops.length === 0 && stops.length > 0 && "As paragens desta rota não têm morada válida para traçar o trajeto.") ||
    null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div ref={mapRef} className="w-full h-[420px]" />
        {failureMsg && (
          <div className="absolute inset-0 grid place-items-center bg-background/85 p-6 text-center">
            <div className="max-w-md space-y-2">
              <div className="text-sm font-medium text-rose-600">Trajeto não disponível</div>
              <p className="text-xs text-muted-foreground">{failureMsg}</p>
              <p className="text-xs text-muted-foreground">
                Corrige a morada/código postal das entregas ou usa o botão “Abrir trajeto” para ver no Google Maps.
              </p>
            </div>
          </div>
        )}
        {isLoading && !failureMsg && (
          <div className="absolute inset-0 grid place-items-center bg-background/70 text-sm text-muted-foreground">
            A calcular trajeto…
          </div>
        )}
      </div>
      <div className="px-4 pb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {data && !failureMsg && (
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
