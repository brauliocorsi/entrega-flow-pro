import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listTemplates,
  upsertTemplate,
  deleteTemplate,
  generateRoutes,
  createRouteForDate,
  bulkDeleteRoutes,
} from "@/lib/templates.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WEEKDAYS_PT } from "@/lib/constants";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw, Calendar as CalendarIcon, Wand2 } from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin/templates")({
  head: () => ({ meta: [{ title: "Admin · Templates de Rotas — UP Agenda" }] }),
  component: AdminTemplatesPage,
});

type Template = {
  id: string;
  name: string;
  weekday: number;
  zone: string;
  zip_prefixes: string[];
  max_capacity_m3: number;
  max_minutes: number;
  default_driver: string | null;
  active: boolean;
  notes: string | null;
};

const empty = {
  name: "",
  weekday: 1,
  zone: "",
  zip_prefixes: "",
  max_capacity_m3: 20,
  max_minutes: 480,
  default_driver: "",
  active: true,
  notes: "",
  color: "#3b82f6",
};

function AdminTemplatesPage() {
  const { role, loading } = useAuth();
  const router = useRouter();
  const fnList = useServerFn(listTemplates);
  const fnUpsert = useServerFn(upsertTemplate);
  const fnDelete = useServerFn(deleteTemplate);
  const fnGenerate = useServerFn(generateRoutes);
  const fnCreateOne = useServerFn(createRouteForDate);
  const fnBulkDelete = useServerFn(bulkDeleteRoutes);

  const [items, setItems] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const todayStr = new Date().toISOString().slice(0, 10);
  const fourWeeksStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return d.toISOString().slice(0, 10);
  })();

  // Generator dialog
  const [genOpen, setGenOpen] = useState(false);
  const [genTemplates, setGenTemplates] = useState<Set<string>>(new Set());
  const [genFrequency, setGenFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [genEndDate, setGenEndDate] = useState<string>(fourWeeksStr);

  // Single create
  const [oneOpen, setOneOpen] = useState(false);
  const [oneTemplateId, setOneTemplateId] = useState<string>("");
  const [oneDate, setOneDate] = useState<string>(todayStr);

  // Bulk delete
  const [delOpen, setDelOpen] = useState(false);
  const [delWeekdays, setDelWeekdays] = useState<Set<number>>(new Set());
  const [delTemplates, setDelTemplates] = useState<Set<string>>(new Set());
  const [delFrom, setDelFrom] = useState<string>(todayStr);
  const [delTo, setDelTo] = useState<string>("");
  const [delPreview, setDelPreview] = useState<{ candidates: number; willDelete: number; blocked: number } | null>(null);


  async function refresh() {
    setBusy(true);
    try {
      const data = await fnList({ data: {} as any });
      setItems(data as Template[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro a carregar");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && role === "admin") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, role]);

  if (!loading && role !== "admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sem permissões</CardTitle>
          <CardDescription>Apenas administradores podem aceder a esta página.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...empty });
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(t: Template & { color?: string }) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      weekday: t.weekday,
      zone: t.zone,
      zip_prefixes: t.zip_prefixes.join(", "),
      max_capacity_m3: Number(t.max_capacity_m3),
      max_minutes: Number(t.max_minutes),
      default_driver: t.default_driver ?? "",
      active: t.active,
      notes: t.notes ?? "",
      color: t.color ?? "#3b82f6",
    });
    setFieldErrors({});
    setDialogOpen(true);
  }

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    const val = Number(form.max_minutes);
    if (!Number.isFinite(val) || !Number.isInteger(val) || val < 1) {
      errors.max_minutes = "O tempo de rota deve ser um número inteiro positivo (mínimo 1 minuto).";
    } else if (val > 1440) {
      errors.max_minutes = "O tempo de rota não pode exceder 1440 minutos (24 horas).";
    }
    return errors;
  }

  async function handleSave() {
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const prefixes = form.zip_prefixes
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await fnUpsert({
        data: {
          id: editingId ?? undefined,
          name: form.name.trim(),
          weekday: Number(form.weekday),
          zone: form.zone.trim(),
          zip_prefixes: prefixes,
          max_capacity_m3: Number(form.max_capacity_m3),
          max_minutes: Number(form.max_minutes),
          default_driver: form.default_driver.trim() || null,
          active: form.active,
          notes: form.notes.trim() || null,
          color: form.color,
        },
      });
      toast.success(editingId ? "Template atualizado" : "Template criado");
      setDialogOpen(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Eliminar este template? As rotas já criadas mantêm-se.")) return;
    try {
      await fnDelete({ data: { id } });
      toast.success("Template eliminado");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fnGenerate({
        data: {
          weeks: 4,
          templateIds: genTemplates.size > 0 ? Array.from(genTemplates) : undefined,
          frequency: genFrequency,
          endDate: genEndDate || undefined,
        },
      });
      toast.success(`Rotas: ${res.created} criadas, ${res.skipped} já existiam`);
      setGenOpen(false);
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateOne() {
    if (!oneTemplateId || !oneDate) return;
    try {
      await fnCreateOne({ data: { templateId: oneTemplateId, date: oneDate } });
      toast.success("Rota criada");
      setOneOpen(false);
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleBulkDeletePreview() {
    try {
      const res = await fnBulkDelete({
        data: {
          weekdays: delWeekdays.size > 0 ? Array.from(delWeekdays) : undefined,
          templateIds: delTemplates.size > 0 ? Array.from(delTemplates) : undefined,
          from: delFrom || undefined,
          to: delTo || undefined,
          dryRun: true,
        },
      });
      setDelPreview({ candidates: res.candidates, willDelete: res.willDelete ?? 0, blocked: res.blocked });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  async function handleBulkDeleteConfirm() {
    try {
      const res = await fnBulkDelete({
        data: {
          weekdays: delWeekdays.size > 0 ? Array.from(delWeekdays) : undefined,
          templateIds: delTemplates.size > 0 ? Array.from(delTemplates) : undefined,
          from: delFrom || undefined,
          to: delTo || undefined,
          dryRun: false,
        },
      });
      toast.success(`Eliminadas ${res.deleted} rotas. ${res.blocked} bloqueadas por terem entregas.`);
      setDelOpen(false);
      setDelPreview(null);
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  function toggleInSet<T>(setVal: Set<T>, item: T, setter: (s: Set<T>) => void) {
    const next = new Set(setVal);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setter(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates de Rotas</h1>
          <p className="text-sm text-muted-foreground">Define rotas recorrentes por dia da semana, zona e códigos postais.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOneOpen(true)}>
            <CalendarIcon className="h-4 w-4 mr-2" /> Abrir rota num dia
          </Button>
          <Button variant="outline" onClick={() => setGenOpen(true)} disabled={generating}>
            <Wand2 className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
            Gerar rotas
          </Button>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={() => {
              setDelPreview(null);
              setDelOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" /> Eliminar em massa
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Novo template
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {busy && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Sem templates ainda. Cria o primeiro para começar.
            </CardContent>
          </Card>
        ) : (
          items.map((t: any) => (
            <Card key={t.id} className={`border-l-4 ${t.active ? "" : "opacity-60"}`} style={{ borderLeftColor: t.color ?? "#3b82f6" }}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div
                  className="h-10 w-10 rounded-md border shrink-0"
                  style={{ backgroundColor: t.color ?? "#3b82f6" }}
                  title={t.color ?? "#3b82f6"}
                />
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    <Badge variant="secondary">{WEEKDAYS_PT[t.weekday]}</Badge>
                    {!t.active && <Badge variant="outline">Inativo</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t.zone} · {Number(t.max_capacity_m3)} m³ · {Number(t.max_minutes)} min
                    {t.default_driver ? ` · ${t.default_driver}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.zip_prefixes.map((p: string) => (
                      <Badge key={p} variant="outline" className="text-xs">CP {p}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar template" : "Novo template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rota Porto Norte" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dia da semana</Label>
                <Select value={String(form.weekday)} onValueChange={(v) => setForm({ ...form, weekday: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS_PT.map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Capacidade (m³)</Label>
                <Input type="number" min={1} max={200} value={form.max_capacity_m3} onChange={(e) => setForm({ ...form, max_capacity_m3: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tempo de rota (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={form.max_minutes}
                  onChange={(e) => {
                    setForm({ ...form, max_minutes: Number(e.target.value) });
                    if (fieldErrors.max_minutes) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.max_minutes;
                        return next;
                      });
                    }
                  }}
                  className={fieldErrors.max_minutes ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {fieldErrors.max_minutes && (
                  <p className="text-xs text-red-600">{fieldErrors.max_minutes}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Motorista (opcional)</Label>
                <Input value={form.default_driver} onChange={(e) => setForm({ ...form, default_driver: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Zona</Label>
              <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Porto / Grande Porto" />
            </div>
            <div className="space-y-1.5">
              <Label>Códigos Postais / Intervalos</Label>
              <Input
                value={form.zip_prefixes}
                onChange={(e) => setForm({ ...form, zip_prefixes: e.target.value })}
                placeholder="1000-1999, 2400-2499, 4100"
              />
              <p className="text-xs text-muted-foreground">
                Combina várias zonas na mesma rota. Aceita prefixos (<code>4100</code>), CP4 exactos e
                intervalos (<code>1000-1999</code>). Separar por vírgula. Ex.: Lisboa + Leiria = <code>1000-1999, 2400-2499</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Cor do template</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-9 w-12 rounded border cursor-pointer"
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="#3b82f6"
                  className="font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">Cor usada para identificar visualmente as rotas geradas deste template.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Ativo</Label>
                <p className="text-xs text-muted-foreground">Templates inativos não geram novas rotas.</p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.zone.trim()}>
              {editingId ? "Guardar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generator dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar rotas</DialogTitle>
            <DialogDescription>
              Escolhe quais templates, com que frequência e até que data queres gerar rotas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Templates ({genTemplates.size === 0 ? "todos ativos" : `${genTemplates.size} selecionados`})</Label>
              <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                {items.filter((t) => t.active).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-muted">
                    <Checkbox
                      checked={genTemplates.has(t.id)}
                      onCheckedChange={() => toggleInSet(genTemplates, t.id, setGenTemplates)}
                    />
                    <span className="flex-1">{t.name}</span>
                    <Badge variant="secondary" className="text-xs">{WEEKDAYS_PT[t.weekday]}</Badge>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={genFrequency} onValueChange={(v) => setGenFrequency(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal (todas as semanas)</SelectItem>
                    <SelectItem value="biweekly">Quinzenal (a cada 15 dias)</SelectItem>
                    <SelectItem value="monthly">Mensal (1× por mês)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data limite</Label>
                <Input type="date" value={genEndDate} min={todayStr} onChange={(e) => setGenEndDate(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Para 1×/semana mantém Semanal. Para 2×/semana cria dois templates no mesmo dia ou em dias diferentes e gera ambos em Semanal.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={generating}>
              <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
              Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single create dialog */}
      <Dialog open={oneOpen} onOpenChange={setOneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir rota num dia específico</DialogTitle>
            <DialogDescription>Cria uma rota individual a partir de um template numa data à escolha.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={oneTemplateId} onValueChange={setOneTemplateId}>
                <SelectTrigger><SelectValue placeholder="Escolher template…" /></SelectTrigger>
                <SelectContent>
                  {items.filter((t) => t.active).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {WEEKDAYS_PT[t.weekday]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={oneDate} min={todayStr} onChange={(e) => setOneDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">A data pode ser num dia da semana diferente do template — é um forçamento manual.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOneOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateOne} disabled={!oneTemplateId || !oneDate}>Criar rota</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete dialog */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Eliminar rotas em massa</DialogTitle>
            <DialogDescription>
              Apenas rotas futuras sem entregas ativas serão eliminadas. As que tiverem entregas serão ignoradas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Dias da semana ({delWeekdays.size === 0 ? "todos" : delWeekdays.size})</Label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS_PT.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleInSet(delWeekdays, i, setDelWeekdays)}
                    className={`px-3 py-1 text-xs rounded-md border ${delWeekdays.has(i) ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Templates ({delTemplates.size === 0 ? "todos" : delTemplates.size})</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {items.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-muted">
                    <Checkbox
                      checked={delTemplates.has(t.id)}
                      onCheckedChange={() => toggleInSet(delTemplates, t.id, setDelTemplates)}
                    />
                    <span className="flex-1">{t.name}</span>
                    <Badge variant="secondary" className="text-xs">{WEEKDAYS_PT[t.weekday]}</Badge>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>De</Label>
                <Input type="date" value={delFrom} onChange={(e) => { setDelFrom(e.target.value); setDelPreview(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Até (opcional)</Label>
                <Input type="date" value={delTo} onChange={(e) => { setDelTo(e.target.value); setDelPreview(null); }} />
              </div>
            </div>
            {delPreview && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p>Encontradas <b>{delPreview.candidates}</b> rotas.</p>
                <p className="text-emerald-700">Serão eliminadas: <b>{delPreview.willDelete}</b></p>
                <p className="text-amber-700">Bloqueadas (têm entregas): <b>{delPreview.blocked}</b></p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDelOpen(false)}>Cancelar</Button>
            <Button variant="outline" onClick={handleBulkDeletePreview}>Pré-visualizar</Button>
            <Button
              variant="destructive"
              onClick={handleBulkDeleteConfirm}
              disabled={!delPreview || delPreview.willDelete === 0}
            >
              Eliminar {delPreview ? `(${delPreview.willDelete})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
