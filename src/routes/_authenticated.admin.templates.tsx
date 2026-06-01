import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates, upsertTemplate, deleteTemplate, generateRoutes } from "@/lib/templates.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WEEKDAYS_PT } from "@/lib/constants";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

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

  const [items, setItems] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  function openEdit(t: Template) {
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
      const res = await fnGenerate({ data: { weeks: 4 } });
      toast.success(`Rotas geradas: ${res.created} criadas, ${res.skipped} já existiam`);
      router.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates de Rotas</h1>
          <p className="text-sm text-muted-foreground">Define rotas recorrentes por dia da semana, zona e códigos postais.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
            Gerar próximas 4 semanas
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
          items.map((t) => (
            <Card key={t.id} className={t.active ? "" : "opacity-60"}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
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
                    {t.zip_prefixes.map((p) => (
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
              <Label>Prefixos de Código Postal</Label>
              <Input
                value={form.zip_prefixes}
                onChange={(e) => setForm({ ...form, zip_prefixes: e.target.value })}
                placeholder="4000, 4100, 4200"
              />
              <p className="text-xs text-muted-foreground">Separar por vírgula. Ex.: 4000, 4100</p>
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
    </div>
  );
}
