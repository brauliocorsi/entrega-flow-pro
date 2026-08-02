import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Download, MapPin, Sparkles } from "lucide-react";
import { listGcOrdersByDeliveryDate, createRouteFromGcOrders, type GcImportOrder } from "@/lib/gc-import.functions";
import { listTemplates } from "@/lib/templates.functions";
import { listRoutes } from "@/lib/routes.functions";
import { zipMatchesPrefixes } from "@/lib/zip-match";
import { formatEUR } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ImportarMarcacoesDialog({ open, onOpenChange }: Props) {
  const listFn = useServerFn(listGcOrdersByDeliveryDate);
  const createFn = useServerFn(createRouteFromGcOrders);
  const templatesFn = useServerFn(listTemplates);
  const routesFn = useServerFn(listRoutes);
  const router = useRouter();

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [scanAll, setScanAll] = useState(false);
  const [orders, setOrders] = useState<GcImportOrder[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<string>(""); // "tpl:<id>" | "route:<id>"

  const { data: templates = [] } = useQuery({
    queryKey: ["templates", "list"],
    queryFn: () => templatesFn(),
    enabled: open,
  });
  const { data: routes = [] } = useQuery({
    queryKey: ["routes", "list"],
    queryFn: () => routesFn({ data: {} }),
    enabled: open,
  });

  const selectedOrders = useMemo(
    () => (orders ?? []).filter((o) => selected.has(o.order_number)),
    [orders, selected],
  );

  // Sugestão: template/rota que cobre a maioria dos CPs seleccionados
  const suggestions = useMemo(() => {
    const base = selectedOrders.length > 0 ? selectedOrders : (orders ?? []).filter((o) => !o.alreadyScheduled);
    const zips = base.map((o) => o.zip_code).filter(Boolean) as string[];
    const routesOnDate = (routes as any[]).filter(
      (r) => r.route_date === date && !["fechada", "concluida"].includes(r.status),
    );
    const scoreOf = (prefs: any) => zips.filter((z) => zipMatchesPrefixes(z, prefs ?? [])).length;
    const items = [
      ...routesOnDate.map((r) => ({
        value: `route:${r.id}`,
        label: `Rota existente — ${r.zone}`,
        score: scoreOf(r.zip_prefixes),
      })),
      ...(templates as any[])
        .filter((t) => t.active)
        .map((t) => ({
          value: `tpl:${t.id}`,
          label: `Nova rota — ${t.name} (${t.zone})`,
          score: scoreOf(t.zip_prefixes),
        })),
    ];
    items.sort((a, b) => b.score - a.score);
    return { items, total: zips.length };
  }, [selectedOrders, orders, routes, templates, date]);

  const best = suggestions.items[0];

  async function handleSearch() {
    setLoading(true);
    setOrders(null);
    setSelected(new Set());
    try {
      const res = await listFn({ data: { date, scanAllSituations: scanAll } });
      if (res.error) {
        toast.error(res.error);
        setOrders([]);
        return;
      }
      setOrders(res.orders);
      setSelected(new Set(res.orders.filter((o) => !o.alreadyScheduled).map((o) => o.order_number)));
      if (res.orders.length === 0) toast.info("Sem marcações no GestãoClick para esta data");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao consultar GestãoClick");
    } finally {
      setLoading(false);
    }
  }

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelected(next);
  }

  async function handleCreate() {
    const pick = target || best?.value;
    if (!pick) {
      toast.error("Escolhe uma rota ou template");
      return;
    }
    const payload = selectedOrders
      .filter((o) => !o.alreadyScheduled)
      .map((o) => ({ internal_id: o.internal_id, order_number: o.order_number }));
    if (payload.length === 0) {
      toast.error("Selecciona pelo menos uma encomenda por agendar");
      return;
    }
    setCreating(true);
    try {
      const res = await createFn({
        data: {
          date,
          ...(pick.startsWith("tpl:")
            ? { templateId: pick.slice(4) }
            : { routeId: pick.slice(6) }),
          orders: payload,
          volume_m3: 1,
          estimated_minutes: 45,
        },
      });
      toast.success(
        `${res.imported} entrega(s) importada(s)${res.routeCreated ? " — rota criada" : ""}`,
      );
      if (res.skipped.length > 0) {
        toast.warning(
          `${res.skipped.length} ignorada(s): ${res.skipped
            .slice(0, 3)
            .map((s) => `${s.order_number} (${s.reason})`)
            .join("; ")}`,
        );
      }
      onOpenChange(false);
      router.navigate({ to: "/rotas/$id", params: { id: res.routeId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar rota");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Importar marcações do GestãoClick
          </DialogTitle>
          <DialogDescription>
            Escolhe a data de entrega, vê as vendas marcadas nessa data e cria a rota com as
            encomendas seleccionadas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <Label className="text-xs">Data de entrega</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
            <Checkbox checked={scanAll} onCheckedChange={(v) => setScanAll(Boolean(v))} />
            Todas as situações
          </label>
          <Button onClick={handleSearch} disabled={loading || !date}>
            <Download className="h-4 w-4 mr-1" />
            {loading ? "A procurar…" : "Procurar"}
          </Button>
        </div>

        {orders !== null && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {orders.length} marcação(ões) · {selected.size} seleccionada(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSelected(new Set(orders.filter((o) => !o.alreadyScheduled).map((o) => o.order_number)))
                  }
                >
                  Todas
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Nenhuma
                </Button>
              </div>
            </div>

            <div className="max-h-[40vh] overflow-y-auto space-y-2 pr-1">
              {orders.map((o) => (
                <div
                  key={o.order_number}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    o.alreadyScheduled ? "opacity-60" : ""
                  }`}
                >
                  <Checkbox
                    className="mt-1"
                    checked={selected.has(o.order_number)}
                    disabled={o.alreadyScheduled}
                    onCheckedChange={() => toggle(o.order_number)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">#{o.order_number}</span>
                      <Badge variant="secondary" className="text-[10px]">{o.situation}</Badge>
                      {o.alreadyScheduled && (
                        <Badge variant="outline" className="text-[10px]">
                          Já em rota {o.scheduledRouteZone ?? ""}
                        </Badge>
                      )}
                      {!o.zip_code && (
                        <Badge variant="destructive" className="text-[10px]">Sem CP</Badge>
                      )}
                    </div>
                    <p className="text-sm truncate">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[o.zip_code, o.city, o.address].filter(Boolean).join(" · ") || "Sem morada"}
                    </p>
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap">
                    {formatEUR(o.total_value)}
                  </span>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhuma marcação encontrada para esta data.
                </p>
              )}
            </div>

            {orders.length > 0 && (
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Rota indicada pelos códigos postais
                </Label>
                <Select value={target || best?.value || ""} onValueChange={setTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher rota ou template" />
                  </SelectTrigger>
                  <SelectContent>
                    {suggestions.items.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label} — {s.score}/{suggestions.total} CPs
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {best && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Sugestão: {best.label} cobre {best.score} de {suggestions.total} códigos postais.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || selectedOrders.filter((o) => !o.alreadyScheduled).length === 0}
          >
            {creating ? "A criar…" : "Criar rota com selecionadas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
