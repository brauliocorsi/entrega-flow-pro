import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFeeRanges, upsertFeeRange, deleteFeeRange } from "@/lib/fees.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatEUR } from "@/lib/format";
import { resolveRangeColor, pickRangeForZip, DISTRITO_TO_CP } from "@/lib/zone-colors";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Printer, Search } from "lucide-react";

// Leaflet só no cliente
const MapaZonas = lazy(() => import("@/components/MapaZonas").then((m) => ({ default: m.MapaZonas })));

export const Route = createFileRoute("/_authenticated/admin/taxas")({
  head: () => ({ meta: [{ title: "Admin · Taxas de entrega — UP Agenda" }] }),
  component: AdminFeesPage,
});

type Range = {
  id: string;
  label: string | null;
  zip_start: string;
  zip_end: string;
  fee: number;
  priority: number;
  active: boolean;
  notes: string | null;
  color: string | null;
};

const empty = {
  label: "",
  zip_start: "",
  zip_end: "",
  fee: 0,
  priority: 0,
  active: true,
  notes: "",
  color: "" as string,
};

function AdminFeesPage() {
  const { role, loading } = useAuth();
  const fnList = useServerFn(listFeeRanges);
  const fnUpsert = useServerFn(upsertFeeRange);
  const fnDelete = useServerFn(deleteFeeRange);

  const [items, setItems] = useState<Range[]>([]);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });

  async function refresh() {
    setBusy(true);
    try {
      const data = await fnList();
      setItems(data as Range[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading && role === "admin") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, role]);

  if (!loading && role !== "admin") {
    return <div className="text-sm text-muted-foreground">Sem permissão.</div>;
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...empty });
    setDialogOpen(true);
  }

  function openEdit(r: Range) {
    setEditingId(r.id);
    setForm({
      label: r.label ?? "",
      zip_start: r.zip_start,
      zip_end: r.zip_end,
      fee: Number(r.fee),
      priority: r.priority,
      active: r.active,
      notes: r.notes ?? "",
      color: r.color ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!/^\d{4}$/.test(form.zip_start) || !/^\d{4}$/.test(form.zip_end)) {
      toast.error("CP deve ter 4 dígitos");
      return;
    }
    if (form.zip_start > form.zip_end) {
      toast.error("CP inicial deve ser ≤ CP final");
      return;
    }
    if (form.color && !/^#[0-9a-fA-F]{6}$/.test(form.color)) {
      toast.error("Cor inválida (usa #RRGGBB ou deixa vazio)");
      return;
    }
    setBusy(true);
    try {
      await fnUpsert({
        data: {
          id: editingId ?? undefined,
          label: form.label || null,
          zip_start: form.zip_start,
          zip_end: form.zip_end,
          fee: Number(form.fee),
          priority: Number(form.priority),
          active: form.active,
          notes: form.notes || null,
          color: form.color ? form.color.toLowerCase() : null,
        },
      });
      toast.success(editingId ? "Atualizado" : "Criado");
      setDialogOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apagar este intervalo?")) return;
    try {
      await fnDelete({ data: { id } });
      toast.success("Apagado");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Taxas de entrega</h1>
          <p className="text-sm text-muted-foreground">
            Define intervalos de código postal e a taxa sugerida. Em sobreposição vence o de
            <strong> menor número de prioridade</strong> (0 = topo); em empate, o intervalo mais pequeno.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handlePrintPDF(items)}>
            <Printer className="h-4 w-4 mr-1" /> Descarregar PDF
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Novo intervalo
          </Button>
        </div>
      </div>

      <CPValidator ranges={items} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-3 lg:col-span-2">
          <ClientOnly fallback={<div className="h-[520px] flex items-center justify-center text-sm text-muted-foreground">A carregar mapa…</div>}>
            <Suspense fallback={<div className="h-[520px] flex items-center justify-center text-sm text-muted-foreground">A carregar mapa…</div>}>
              <MapaZonas ranges={items} />
            </Suspense>
          </ClientOnly>
        </Card>

        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b font-medium text-sm">Legenda</div>
          {items.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Sem intervalos.</div>
          ) : (
            <div className="divide-y max-h-[520px] overflow-auto">
              {items
                .slice()
                .sort((a, b) => a.zip_start.localeCompare(b.zip_start))
                .map((r) => (
                  <div key={r.id} className="p-2.5 flex items-center gap-2 text-sm">
                    <span
                      className="inline-block h-4 w-4 rounded shrink-0 border"
                      style={{ background: resolveRangeColor(r, items) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.label || `${r.zip_start}–${r.zip_end}`}</div>
                      <div className="text-xs text-muted-foreground">
                        CP {r.zip_start}–{r.zip_end} · Prio. {r.priority}
                      </div>
                    </div>
                    <div className="tabular-nums text-sm font-semibold">{formatEUR(r.fee)}</div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        {busy && items.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">A carregar…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Sem intervalos configurados.</div>
        ) : (
          <div className="divide-y">
            {items.map((r) => (
              <div key={r.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-3">
                  <span
                    className="inline-block h-5 w-5 rounded border shrink-0"
                    style={{ background: resolveRangeColor(r, items) }}
                  />
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">
                      {r.label || `${r.zip_start}–${r.zip_end}`}
                      {!r.active && <Badge variant="outline">Inativo</Badge>}
                      <Badge variant="secondary">Prio. {r.priority}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      CP {r.zip_start}–{r.zip_end}
                      {r.notes ? ` · ${r.notes}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold tabular-nums">{formatEUR(r.fee)}</div>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar intervalo" : "Novo intervalo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Rótulo (opcional)</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ex: Aveiro centro"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CP inicial</Label>
                <Input
                  maxLength={4}
                  value={form.zip_start}
                  onChange={(e) => setForm({ ...form, zip_start: e.target.value.replace(/\D/g, "") })}
                  placeholder="4000"
                />
              </div>
              <div>
                <Label>CP final</Label>
                <Input
                  maxLength={4}
                  value={form.zip_end}
                  onChange={(e) => setForm({ ...form, zip_end: e.target.value.replace(/\D/g, "") })}
                  placeholder="4999"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Prioridade (0 = topo)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 p-1"
                  value={form.color || "#3b82f6"}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                />
                <Input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="#3b82f6 (vazio = automático por valor)"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, color: "" })}>
                  Auto
                </Button>
              </div>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CPValidator({ ranges }: { ranges: Range[] }) {
  const [cp, setCp] = useState("");
  const clean = cp.replace(/\D/g, "").slice(0, 4);
  const isValid = /^\d{4}$/.test(clean);
  const matches = isValid
    ? ranges
        .filter((r) => r.active && r.zip_start <= clean && r.zip_end >= clean)
        .slice()
        .sort((a, b) => a.priority - b.priority || (Number(a.zip_end) - Number(a.zip_start)) - (Number(b.zip_end) - Number(b.zip_start)))
    : [];
  const best = matches[0] ?? null;
  const distrito = isValid
    ? Object.entries(DISTRITO_TO_CP).find(([, c]) => c.slice(0, 2) === clean.slice(0, 2))?.[0] ?? "—"
    : "—";

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-medium">Validar Código Postal</div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          maxLength={4}
          value={cp}
          onChange={(e) => setCp(e.target.value)}
          placeholder="Ex: 4500"
          className="w-32"
        />
        {!isValid && cp.length > 0 && (
          <span className="text-xs text-rose-600">CP4 inválido (4 dígitos)</span>
        )}
        {isValid && !best && (
          <span className="text-xs text-amber-600">Sem zona configurada para {clean}</span>
        )}
        {isValid && best && (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-block h-4 w-4 rounded border"
              style={{ background: resolveRangeColor(best, ranges) }}
            />
            <span className="text-sm font-medium">{best.label ?? `${best.zip_start}–${best.zip_end}`}</span>
            <Badge variant="secondary">Distrito: {distrito}</Badge>
            <Badge variant="outline">CP {best.zip_start}–{best.zip_end}</Badge>
            <Badge variant="outline">Prio. {best.priority}</Badge>
            <span className="text-base font-semibold tabular-nums">{formatEUR(best.fee)}</span>
          </div>
        )}
      </div>
      {isValid && matches.length > 1 && (
        <div className="mt-3 text-xs text-muted-foreground">
          Outras zonas que contêm este CP:{" "}
          {matches.slice(1).map((r) => `${r.label ?? `${r.zip_start}–${r.zip_end}`} (${formatEUR(r.fee)} · p${r.priority})`).join(" · ")}
        </div>
      )}
    </Card>
  );
}

function handlePrintPDF(items: Range[]) {
  const sorted = items.slice().sort((a, b) => a.zip_start.localeCompare(b.zip_start) || a.priority - b.priority);
  const rows = sorted
    .map((r) => {
      const color = resolveRangeColor(r, items);
      const frac = r.zip_start.slice(0, 2) === r.zip_end.slice(0, 2) ? `${r.zip_start.slice(0, 2)}xx` : `${r.zip_start.slice(0, 2)}xx–${r.zip_end.slice(0, 2)}xx`;
      const dist = Object.entries(DISTRITO_TO_CP).find(([, c]) => c >= r.zip_start && c <= r.zip_end)?.[0] ?? "—";
      return `<tr>
        <td><span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${color};border:1px solid #cbd5e1"></span></td>
        <td>${escapeHtml(r.label ?? `${r.zip_start}–${r.zip_end}`)}</td>
        <td>${dist}</td>
        <td style="text-align:center">${r.zip_start}</td>
        <td style="text-align:center">${r.zip_end}</td>
        <td style="text-align:center">${frac}</td>
        <td style="text-align:center">${r.priority}</td>
        <td style="text-align:right;font-weight:600">${formatEUR(r.fee)}</td>
        <td>${escapeHtml(r.notes ?? "")}</td>
      </tr>`;
    })
    .join("");
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"/>
    <title>Taxas de Entrega por Localização</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:20px;margin:0 0 4px}
      .sub{color:#64748b;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #e2e8f0;padding:6px 8px;vertical-align:middle}
      thead th{background:#0f172a;color:#fff;text-align:left}
      tbody tr:nth-child(even){background:#f8fafc}
      @media print{@page{size:A4 landscape;margin:12mm} body{padding:0}}
    </style></head><body>
    <h1>Taxas de Entrega por Localização</h1>
    <div class="sub">Portugal Continental · Gerado em ${new Date().toLocaleString("pt-PT")} · Em sobreposição vence o de menor prioridade (0 = topo); em empate, o intervalo mais estreito.</div>
    <table>
      <thead><tr>
        <th>Cor</th><th>Localização</th><th>Distrito</th><th>CP Inicial</th><th>CP Final</th><th>Fração CP4</th><th>Prio.</th><th>Taxa</th><th>Notas</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Permite janelas pop-up para descarregar o PDF");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
