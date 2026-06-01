import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listRoutes } from "@/lib/routes.functions";
import { listPendingReschedules } from "@/lib/deliveries.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, WEEKDAYS_PT } from "@/lib/constants";
import { formatDatePT } from "@/lib/format";
import { Calendar as CalendarIcon, List, Truck, MapPin, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rotas")({
  head: () => ({ meta: [{ title: "Rotas — UP Agenda" }] }),
  component: RoutesPage,
});

function RoutesPage() {
  const listFn = useServerFn(listRoutes);
  const pendingFn = useServerFn(listPendingReschedules);
  const [view, setView] = useState<"lista" | "calendario">("lista");

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rotas de entrega</h1>
          <p className="text-sm text-muted-foreground">{rows.length} rotas planeadas</p>
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

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">A carregar…</div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Truck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Sem rotas planeadas</p>
          <p className="text-sm text-muted-foreground mt-1">Um admin precisa de criar templates e gerar rotas.</p>
        </Card>
      ) : view === "lista" ? (
        <ListView rows={rows} />
      ) : (
        <CalendarView rows={rows} />
      )}
    </div>
  );
}

function ListView({ rows }: { rows: any[] }) {
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
    <div className="space-y-4">
      {grouped.map(([date, routes]) => {
        const d = new Date(date + "T00:00:00");
        return (
          <div key={date}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
              {WEEKDAYS_PT[d.getDay()]} — {formatDatePT(date)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {routes.map((r) => <RouteCard key={r.id} r={r} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RouteCard({ r }: { r: any }) {
  const pct = Math.min(100, (Number(r.current_volume_m3) / Number(r.max_capacity_m3)) * 100);
  return (
    <Link to="/rotas/$id" params={{ id: r.id }}>
      <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer h-full">
        <div className="flex items-start justify-between mb-2">
          <div className="font-semibold flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" /> {r.zone}
          </div>
          <Badge className={ROUTE_STATUS_TONE[r.status]}>{ROUTE_STATUS_LABEL[r.status]}</Badge>
        </div>
        {r.driver && <div className="text-xs text-muted-foreground mb-2">Motorista: {r.driver}</div>}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Ocupação</span>
            <span className="font-medium">{Number(r.current_volume_m3).toFixed(1)} / {Number(r.max_capacity_m3).toFixed(1)} m³</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-muted-foreground">{r.deliveries_count} entregas</div>
        </div>
      </Card>
    </Link>
  );
}

function CalendarView({ rows }: { rows: any[] }) {
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
        return (
          <div key={key} className="border rounded-md p-2 min-h-[100px] bg-background" style={colStart ? { gridColumnStart: colStart } : undefined}>
            <div className="text-xs font-medium mb-1">{d.getDate()}</div>
            <div className="space-y-1">
              {routes.map((r) => (
                <Link key={r.id} to="/rotas/$id" params={{ id: r.id }} className="block">
                  <div className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${ROUTE_STATUS_TONE[r.status]}`} title={`${r.zone} — ${ROUTE_STATUS_LABEL[r.status]}`}>
                    {r.zone}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
