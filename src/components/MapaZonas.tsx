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
    const cp = distrito ? DISTRITO_TO_CP[distrito] : null;
    const range = cp ? pickRangeForZip(cp, ranges) : null;
    const color = range ? getRangeColor(range) : "#cbd5e1";
    return {
      color: "#1e293b",
      weight: 1,
      fillColor: color,
      fillOpacity: 0.65,
    };
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
            key={ranges.map((r) => `${r.id}:${r.color}:${r.fee}`).join("|")}
            data={geo}
            style={styleFor as any}
            onEachFeature={(feature, layer) => {
              const distrito = feature.properties?.distrito as string;
              const cp = DISTRITO_TO_CP[distrito];
              const range = cp ? pickRangeForZip(cp, ranges) : null;
              const label = range
                ? `${distrito} · ${range.label ?? `${range.zip_start}–${range.zip_end}`} · ${formatEUR(Number(range.fee))}`
                : `${distrito} · (sem zona)`;
              layer.bindTooltip(label, { sticky: true });
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
