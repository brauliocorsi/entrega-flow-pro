import { createFileRoute, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listRoutes, mergeRoutes, deleteRoute } from "@/lib/routes.functions";
import { listPendingReschedules } from "@/lib/deliveries.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
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
  Sun,
  Merge,
  Trash2,
} from "lucide-react";
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
  const mergeFn = useServerFn(mergeRoutes);
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Merge dialog state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeDate, setMergeDate] = useState<string>("");
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [merging, setMerging] = useState(false);

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

  const mergeDates = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.route_date || r.route_date < today) continue;
      if (["fechada", "concluida"].includes(r.status)) continue;
      map.set(r.route_date, (map.get(r.route_date) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .filter(([, n]) => n >= 2)
      .map(([d]) => d)
      .sort();
  }, [rows]);

  const mergeRoutesOnDate = useMemo(
    () =>
      rows.filter(
        (r: any) =>
          r.route_date === mergeDate && !["fechada", "concluida"].includes(r.status),
      ),
    [rows, mergeDate],
  );

  function toggleMergePick(id: string) {
    const next = new Set(mergeSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setMergeSelected(next);
    if (mergeTargetId && !next.has(mergeTargetId)) setMergeTargetId("");
  }

  function openMerge() {
    setMergeDate(mergeDates[0] ?? "");
    setMergeSelected(new Set());
    setMergeTargetId("");
    setMergeOpen(true);
  }

  async function handleMerge() {
    if (mergeSelected.size < 2 || !mergeTargetId) return;
    setMerging(true);
    try {
      const sourceIds = Array.from(mergeSelected).filter((id) => id !== mergeTargetId);
      const res = await mergeFn({ data: { targetId: mergeTargetId, sourceIds } });
      toast.success(`${res.removed} rota(s) mescladas em "${res.zone}"`);
      setMergeOpen(false);
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setMerging(false);
    }
  }

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
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={openMerge}
              disabled={mergeDates.length === 0}
              title={mergeDates.length === 0 ? "Sem datas com 2+ rotas abertas" : "Mesclar rotas da mesma data"}
            >
              <Merge className="h-4 w-4 mr-1" /> Mesclar rotas
            </Button>
          )}
          <Button variant={view === "lista" ? "default" : "outline"} size="sm" onClick={() => setView("lista")}>
            <List className="h-4 w-4 mr-1" /> Lista
          </Button>
          <Button variant={view === "calendario" ? "default" : "outline"} size="sm" onClick={() => setView("calendario")}>
            <CalendarIcon className="h-4 w-4 mr-1" /> Calendário
          </Button>
        </div>
      </div>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mesclar rotas</DialogTitle>
            <DialogDescription>
              Junta várias rotas da mesma data numa só. As entregas são transferidas, os códigos postais e a capacidade são somados, e as rotas de origem são eliminadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Select value={mergeDate} onValueChange={(v) => { setMergeDate(v); setMergeSelected(new Set()); setMergeTargetId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher data" />
                </SelectTrigger>
                <SelectContent>
                  {mergeDates.map((d) => (
                    <SelectItem key={d} value={d}>{formatDatePT(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mergeDate && (
              <div className="space-y-2">
                <Label>Rotas a mesclar (mínimo 2) e rota destino</Label>
                <div className="rounded-md border divide-y max-h-72 overflow-auto">
                  {mergeRoutesOnDate.map((r: any) => {
                    const checked = mergeSelected.has(r.id);
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-2.5">
                        <Checkbox checked={checked} onCheckedChange={() => toggleMergePick(r.id)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color ?? "#3b82f6" }} />
                            {r.zone}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            CP {(r.zip_prefixes ?? []).join(", ") || "—"} · {Number(r.current_volume_m3 ?? 0).toFixed(1)}/{Number(r.max_capacity_m3).toFixed(0)} m³ · {r.deliveries_count ?? 0} entr.
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <input
                            type="radio"
                            name="merge-target"
                            disabled={!checked}
                            checked={mergeTargetId === r.id}
                            onChange={() => setMergeTargetId(r.id)}
                          />
                          <span className={checked ? "" : "text-muted-foreground"}>Destino</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  A rota destino mantém-se. As restantes são eliminadas após mover as entregas.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleMerge}
              disabled={merging || mergeSelected.size < 2 || !mergeTargetId}
            >
              {merging ? "A mesclar…" : `Mesclar ${mergeSelected.size} rota${mergeSelected.size === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
        <ListView rows={filtered} codes={codes} isAdmin={isAdmin} />
      ) : (
        <CalendarView rows={filtered} codes={codes} />
      )}
    </div>
  );
}

function ListView({ rows, codes, isAdmin }: { rows: any[]; codes: Map<string, string>; isAdmin?: boolean }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter((r) => r.route_date === todayStr);
  const futureRows = rows.filter((r) => r.route_date > todayStr);

  const futureGrouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of futureRows) {
      const k = r.route_date;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [futureRows]);

  return (
    <div className="space-y-6">
      {/* Rotas de hoje — destaque */}
      {todayRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Sun className="h-5 w-5 text-amber-500" />
            <div className="text-sm uppercase tracking-wider text-amber-700 font-bold">
              Hoje — {WEEKDAYS_PT[new Date(todayStr + "T00:00:00").getDay()]} {formatDatePT(todayStr)}
            </div>
            <div className="flex-1 h-px bg-amber-200" />
            <span className="text-xs text-amber-700 font-medium">{todayRows.length} rota{todayRows.length > 1 ? "s" : ""}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {todayRows.map((r) => <RouteCard key={r.id} r={r} code={codes.get(r.id)} highlight isAdmin={isAdmin} />)}
          </div>
        </div>
      )}

      {/* Rotas futuras */}
      <div className="space-y-5">
        {futureGrouped.map(([date, routes]) => {
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
                {routes.map((r) => <RouteCard key={r.id} r={r} code={codes.get(r.id)} isAdmin={isAdmin} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteCard({ r, code, highlight, isAdmin }: { r: any; code?: string; highlight?: boolean; isAdmin?: boolean }) {
  const vol = Number(r.current_volume_m3);
  const cap = Number(r.max_capacity_m3);
  const pct = Math.min(100, (vol / cap) * 100);
  const hasAssembly = (r.assembly_count ?? 0) > 0;
  const color = r.color ?? "#3b82f6";
  const router = useRouter();
  const deleteFn = useServerFn(deleteRoute);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const activeCount = Number(r.deliveries_count ?? 0);
  const isLocked = r.status === "concluida";

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteFn({ data: { id: r.id } });
      toast.success("Rota eliminada");
      setConfirmOpen(false);
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro a eliminar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative h-full group">
      <Link to="/rotas/$id" params={{ id: r.id }} className="block h-full">
        <Card className={`p-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer h-full border-l-4 ${highlight ? "ring-2 ring-amber-200 shadow-md bg-amber-50/30" : ""}`} style={{ borderLeftColor: color }}>
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

          <div className="mt-3 rounded-lg border bg-muted/40 p-2.5 grid grid-cols-3 gap-2">
            <Stat icon={<Package className="h-3.5 w-3.5" />} label="Entregas" value={String(r.deliveries_count ?? 0)} />
            <Stat icon={<Box className="h-3.5 w-3.5" />} label="Cubicagem" value={`${vol.toFixed(1)}m³`} />
            <Stat icon={<Clock className="h-3.5 w-3.5" />} label="Tempo" value={formatMinutes(r.total_minutes ?? 0)} />
          </div>

          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Ocupação</span>
              <span className="font-medium">{vol.toFixed(1)} / {cap.toFixed(1)} m³</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {hasAssembly && (
            <div className="mt-3 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
              <Wrench className="h-3 w-3" /> {r.assembly_count} montagem{r.assembly_count > 1 ? "s" : ""}
            </div>
          )}
        </Card>
      </Link>

      {isAdmin && !isLocked && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/80 backdrop-blur border opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition"
          aria-label="Eliminar rota"
          title="Eliminar rota"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar rota?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeCount > 0 ? (
                <span className="text-rose-700">
                  Esta rota tem <strong>{activeCount}</strong> entrega(s) ativas. Reagenda ou cancela essas entregas antes de eliminar.
                </span>
              ) : (
                <>Vais eliminar <strong>{r.zone}</strong> de {formatDatePT(r.route_date)}. Esta acção não pode ser revertida.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || activeCount > 0}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting ? "A eliminar…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
