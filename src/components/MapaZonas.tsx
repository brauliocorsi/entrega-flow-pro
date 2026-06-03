import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { FeatureCollection, Feature } from "geojson";
import "leaflet/dist/leaflet.css";
import { DISTRITO_TO_CP, getRangeColor, pickRangeForZip, resolveRangeColor } from "@/lib/zone-colors";
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

  const macros = ranges.filter((r) => r.priority === 5);
  const styleFor = (f?: Feature) => {
    const distrito = f?.properties?.distrito as string | undefined;
    const cp = distrito ? DISTRITO_TO_CP[distrito] : null;
    const macro = cp ? pickRangeForZip(cp, macros) : null;
    const color = macro ? getRangeColor(macro) : "#cbd5e1";
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
              const cp = DISTRITO_TO_CP[distrito];
              const macro = cp ? pickRangeForZip(cp, macros) : null;
              if (!macro) {
                layer.bindTooltip(`<strong>${distrito}</strong><br/>(sem zona definida)`, { sticky: true });
                return;
              }
              const macroColor = getRangeColor(macro);
              const swatch = (c: string) => `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c};margin-right:6px;vertical-align:middle"></span>`;
              const lines: string[] = [
                `${swatch(macroColor)}${macro.label ?? `${macro.zip_start}–${macro.zip_end}`} · CP ${macro.zip_start}–${macro.zip_end} · ${formatEUR(Number(macro.fee))}`,
              ];
              const subs = ranges.filter(
                (r) => r.active && r.priority < 5 && r.zip_start >= macro.zip_start && r.zip_end <= macro.zip_end,
              );
              for (const s of subs) {
                lines.push(`${swatch(resolveRangeColor(s, ranges))}${s.label ?? `${s.zip_start}–${s.zip_end}`} · CP ${s.zip_start}–${s.zip_end} · ${formatEUR(Number(s.fee))} · p${s.priority}`);
              }
              layer.bindTooltip(`<strong>${distrito}</strong> (CP ${cp}xx)<br/>${lines.join("<br/>")}`, { sticky: true });
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
