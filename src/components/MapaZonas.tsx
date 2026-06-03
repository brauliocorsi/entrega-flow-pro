import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Tooltip } from "react-leaflet";
import type { FeatureCollection, Feature } from "geojson";
import "leaflet/dist/leaflet.css";
import { getRangeColor, pickRangesForDistrict } from "@/lib/zone-colors";
import { formatEUR } from "@/lib/format";

type Range = {
  id: string;
  label: string | null;
  zip_start: string;
  zip_end: string;
  fee: number;
  priority: number;
  active: boolean;
  color: string | null;
};

export function MapaZonas({ ranges }: { ranges: Range[] }) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/portugal-distritos.geojson")
      .then((r) => r.json())
      .then(setGeo)
      .catch((e) => console.error("Falha ao carregar GeoJSON", e));
  }, []);

  const styleFor = (f?: Feature) => {
    const distrito = f?.properties?.distrito as string | undefined;
    const matches = distrito ? pickRangesForDistrict(distrito, ranges) : [];
    const best = matches[0] ?? null;
    const color = best ? getRangeColor(best) : "#cbd5e1";
    return { color: "#1e293b", weight: 1, fillColor: color, fillOpacity: 0.65 };
  };

  return (
    <div className="h-[520px] w-full rounded-lg overflow-hidden border">
      <MapContainer
        center={[39.6, -8.0]}
        zoom={7}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geo && (
          <GeoJSON
            key={ranges.map((r) => `${r.id}:${r.color}:${r.fee}:${r.priority}`).join("|")}
            data={geo}
            style={styleFor as any}
            onEachFeature={(feature, layer) => {
              const distrito = feature.properties?.distrito as string;
              const matches = pickRangesForDistrict(distrito, ranges);
              if (matches.length === 0) {
                layer.bindTooltip(`${distrito} · (sem zona)`, { sticky: true });
                return;
              }
              const lines = matches.map(
                (r) =>
                  `${r.label ?? `${r.zip_start}–${r.zip_end}`} (${r.zip_start}–${r.zip_end}) · ${formatEUR(Number(r.fee))}${r.priority < 5 ? ` · p${r.priority}` : ""}`,
              );
              layer.bindTooltip(`<strong>${distrito}</strong><br/>${lines.join("<br/>")}`, { sticky: true });
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
