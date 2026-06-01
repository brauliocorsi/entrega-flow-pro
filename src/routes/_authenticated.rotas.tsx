import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listRoutes } from "@/lib/routes.functions";
import { listPendingReschedules } from "@/lib/deliveries.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, WEEKDAYS_PT } from "@/lib/constants";
import { formatDatePT } from "@/lib/format";
import {
  Calendar as CalendarIcon,
  List,
  Truck,
  MapPin,
  AlertTriangle,
  Package,
  Clock,
  Wrench,
  Box,
  User,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/rotas")({
  head: () => ({ meta: [{ title: "Rotas — UP Agenda" }] }),
  component: RoutesPage,
});

function formatMinutes(min: number): string {
  if (!min) return "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

// Derives a short code prefix from a zone name (e.g. "Grande Porto" -> "Porto").
export function zoneCodePrefix(zone: string): string {
  if (!zone) return "RT";
  const words = zone.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? zone;
  return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
}

// Assigns a stable sequential code per zone, ordered by route_date then created_at.
export function buildRouteCodes(rows: any[]): Map<string, string> {
  const byZone = new Map<string, any[]>();
  for (const r of rows) {
    const k = r.zone ?? "";
    if (!byZone.has(k)) byZone.set(k, []);
    byZone.get(k)!.push(r);
  }
  const codes = new Map<string, string>();
  for (const [zone, list] of byZone) {
    const sorted = [...list].sort(
      (a, b) =>
        String(a.route_date ?? "").localeCompare(String(b.route_date ?? "")) ||
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
    );
    const prefix = zoneCodePrefix(zone);
    sorted.forEach((r, i) => {
      codes.set(r.id, `${prefix}${String(i + 1).padStart(2, "0")}`);
    });
  }
  return codes;
}

function RoutesPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname !== "/rotas") {
    return <Outlet />;
  }

  return <RoutesIndex />;
}

function RoutesIndex() {
  const listFn = useServerFn(listRoutes);
  const pendingFn = useServerFn(listPendingReschedules);
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: rows = [], isLoading } = useQuery(
    queryOptions({
      queryKey: ["routes", "list"],
      queryFn: () => listFn({ data: {} }),
    }),
  );
  const { data: pending = [] } = useQuery(
    queryOptions({
      queryKey: ["reschedules", "pending"],
      queryFn: () => pendingFn({ data: {} as any }),
    }),
  );

  // Codes are computed from ALL rows so they stay stable when filters change.
  const codes = useMemo(() => buildRouteCodes(rows), [rows]);

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.zone) set.add(r.zone);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (zoneFilter !== "all" && r.zone !== zoneFilter) return false;
      if (dateFrom && String(r.route_date) < dateFrom) return false;
      if (dateTo && String(r.route_date) > dateTo) return false;
      if (q) {
        const code = (codes.get(r.id) ?? "").toLowerCase();
        const hay = `${r.zone ?? ""} ${r.driver ?? ""} ${code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, zoneFilter, dateFrom, dateTo, codes]);

  const hasFilters = search || zoneFilter !== "all" || dateFrom || dateTo;
  const clearFilters = () => {
    setSearch("");
    setZoneFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50/60">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="text-sm flex-1">
              <span className="font-medium text-amber-900">{pending.length} entrega(s) pendentes de reagendamento.</span>
              <span className="text-amber-800/80 ml-1">
                {pending.slice(0, 3).map((p: any) => `#${p.order_number}`).join(", ")}
                {pending.length > 3 ? ` + ${pending.length - 3}` : ""}.
                {" "}Reagenda em <Link to="/agendar" className="underline">Agendar</Link>.
              </span>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rotas de entrega</h1>
          <p className="text-sm text-muted-foreground">
            {hasFilters ? `${filtered.length} de ${rows.length}` : `${rows.length}`} rotas planeadas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={view === "lista" ? "default" : "outline"} size="sm" onClick={() => setView("lista")}>
            <List className="h-4 w-4 mr-1" /> Lista
          </Button>
          <Button variant={view === "calendario" ? "default" : "outline"} size="sm" onClick={() => setView("calendario")}>
            <CalendarIcon className="h-4 w-4 mr-1" /> Calendário
          </Button>
        </div>
      </div>

      {/* Filtros avançados */}
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por código, zona ou motorista…"
              className="pl-8"
            />
          </div>
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Localidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as localidades</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>{z}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Data inicial" />
          </div>
          <div className="flex items-center gap-1">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Data final" />
          </div>
        </div>
        {hasFilters && (
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar filtros
            </Button>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">A carregar…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">{hasFilters ? "Nenhuma rota corresponde aos filtros" : "Sem rotas planeadas"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {hasFilters ? "Ajusta a pesquisa ou limpa os filtros." : "Um admin precisa de criar templates e gerar rotas."}
          </p>
        </Card>
      ) : view === "lista" ? (
        <ListView rows={filtered} codes={codes} />
      ) : (
        <CalendarView rows={filtered} codes={codes} />
      )}
    </div>
  );
}

function ListView({ rows, codes }: { rows: any[]; codes: Map<string, string> }) {
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const k = r.route_date;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="space-y-5">
      {grouped.map(([date, routes]) => {
        const d = new Date(date + "T00:00:00");
        return (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {WEEKDAYS_PT[d.getDay()]} — {formatDatePT(date)}
              </div>
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground">{routes.length} rota{routes.length > 1 ? "s" : ""}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {routes.map((r) => <RouteCard key={r.id} r={r} code={codes.get(r.id)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RouteCard({ r, code }: { r: any; code?: string }) {
  const vol = Number(r.current_volume_m3);
  const cap = Number(r.max_capacity_m3);
  const pct = Math.min(100, (vol / cap) * 100);
  const hasAssembly = (r.assembly_count ?? 0) > 0;
  const color = r.color ?? "#3b82f6";

  return (
    <Link to="/rotas/$id" params={{ id: r.id }} className="block h-full">
      <Card className="p-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full border-l-4" style={{ borderLeftColor: color }}>
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="min-w-0">
            <div className="font-semibold flex items-center gap-1.5 truncate">
              <MapPin className="h-4 w-4 shrink-0" style={{ color }} /> {r.zone}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {code && (
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 tracking-wide">
                  {code}
                </span>
              )}
              {r.driver && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> {r.driver}
                </span>
              )}
            </div>
          </div>
          <Badge className={`${ROUTE_STATUS_TONE[r.status]} shrink-0`}>{ROUTE_STATUS_LABEL[r.status]}</Badge>
        </div>

        {/* Inner stats card */}
        <div className="mt-3 rounded-lg border bg-muted/40 p-2.5 grid grid-cols-3 gap-2">
          <Stat icon={<Package className="h-3.5 w-3.5" />} label="Entregas" value={String(r.deliveries_count ?? 0)} />
          <Stat icon={<Box className="h-3.5 w-3.5" />} label="Cubicagem" value={`${vol.toFixed(1)}m³`} />
          <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Tempo" value={formatMinutes(r.total_minutes ?? 0)} />
        </div>

        {/* Capacity bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Ocupação</span>
            <span className="font-medium">{vol.toFixed(1)} / {cap.toFixed(1)} m³</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Assembly badge */}
        {hasAssembly && (
          <div className="mt-3 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
            <Wrench className="h-3 w-3" /> {r.assembly_count} montagem{r.assembly_count > 1 ? "s" : ""}
          </div>
        )}
      </Card>
    </Link>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-1 text-muted-foreground text-[10px] uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold tabular-nums leading-tight mt-0.5">{value}</div>
    </div>
  );
}

function CalendarView({ rows, codes }: { rows: any[]; codes: Map<string, string> }) {
  // Show next 28 days as a weekly grid
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  const byDate = new Map<string, any[]>();
  for (const r of rows) {
    if (!byDate.has(r.route_date)) byDate.set(r.route_date, []);
    byDate.get(r.route_date)!.push(r);
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((w) => (
        <div key={w} className="text-xs font-medium text-muted-foreground text-center pb-1">{w}</div>
      ))}
      {days.map((d, i) => {
        const key = d.toISOString().slice(0, 10);
        const routes = byDate.get(key) ?? [];
        const colStart = i === 0 ? d.getDay() + 1 : undefined;
        const isToday = i === 0;
        return (
          <div
            key={key}
            className={`border rounded-md p-1.5 min-h-[140px] bg-background ${isToday ? "ring-1 ring-primary/40" : ""}`}
            style={colStart ? { gridColumnStart: colStart } : undefined}
          >
            <div className="text-xs font-semibold mb-1 flex items-center justify-between">
              <span>{d.getDate()}</span>
              {routes.length > 0 && (
                <span className="text-[9px] text-muted-foreground">{routes.length}</span>
              )}
            </div>
            <div className="space-y-1">
              {routes.map((r) => <CalendarRouteCard key={r.id} r={r} code={codes.get(r.id)} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarRouteCard({ r, code }: { r: any; code?: string }) {
  const vol = Number(r.current_volume_m3);
  const cap = Number(r.max_capacity_m3);
  const pct = Math.min(100, (vol / cap) * 100);
  const hasAssembly = (r.assembly_count ?? 0) > 0;
  const color = r.color ?? "#3b82f6";

  return (
    <Link to="/rotas/$id" params={{ id: r.id }} className="block h-full">
      <div className="text-[10px] rounded border border-l-4 bg-card p-1.5 hover:shadow-sm transition-shadow" style={{ borderLeftColor: color }} title={`${code ? code + " · " : ""}${r.zone} — ${ROUTE_STATUS_LABEL[r.status]}`}>
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="font-semibold truncate">
            {code && <span className="font-mono mr-1" style={{ color }}>{code}</span>}
            {r.zone}
          </div>
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} />
        </div>
        <div className="rounded bg-muted/50 px-1 py-0.5 grid grid-cols-3 gap-0.5 tabular-nums">
          <div className="flex items-center gap-0.5 justify-center" title="Entregas">
            <Package className="h-2.5 w-2.5" />{r.deliveries_count ?? 0}
          </div>
          <div className="flex items-center gap-0.5 justify-center" title="Cubicagem">
            <Box className="h-2.5 w-2.5" />{vol.toFixed(1)}
          </div>
          <div className="flex items-center gap-0.5 justify-center" title="Tempo total">
            <Clock className="h-2.5 w-2.5" />{formatMinutes(r.total_minutes ?? 0)}
          </div>
        </div>
        {hasAssembly && (
          <div className="mt-1 flex items-center gap-0.5 text-violet-700">
            <Wrench className="h-2.5 w-2.5" /> {r.assembly_count} mont.
          </div>
        )}
      </div>
    </Link>
  );
}
