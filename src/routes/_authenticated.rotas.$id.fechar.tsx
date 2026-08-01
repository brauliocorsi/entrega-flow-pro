import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getRouteWithDeliveries } from "@/lib/routes.functions";
import { getRouteCash } from "@/lib/cash.functions";
import { closeRoute } from "@/lib/deliveries.functions";
import { syncClosureToGestaoClick } from "@/lib/closure.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { formatEUR } from "@/lib/format";
import { toast } from "sonner";

type Outcome = "entregue" | "entregue_parcial" | "reagendado" | "cancelado";

const OUTCOME_LABEL: Record<Outcome, string> = {
  entregue: "Entregue",
  entregue_parcial: "Parcial",
  reagendado: "Reagendada",
  cancelado: "Cancelada",
};

const GC_LABEL: Record<Outcome, string> = {
  entregue: "Produto Entregue",
  entregue_parcial: "Entrega Parcial",
  reagendado: "Reagendada",
  cancelado: "Cancelada",
};

type ItemState = { description: string; delivered: boolean };
type Entry = { outcome: Outcome; notes: string; items: ItemState[] };
type SyncResult = { delivery_id: string; order_number: string; ok: boolean; error?: string };

export const Route = createFileRoute("/_authenticated/rotas/$id/fechar")({
  head: () => ({
    meta: [
      { title: "Fechar rota — UP Agenda" },
      { name: "description", content: "Conferência previsto vs realizado e fecho da rota." },
    ],
  }),
  component: CloseRoutePage,
});

function CloseRoutePage() {
  const { id } = useParams({ from: "/_authenticated/rotas/$id/fechar" });
  const qc = useQueryClient();
  const fnGet = useServerFn(getRouteWithDeliveries);
  const fnCash = useServerFn(getRouteCash);
  const fnClose = useServerFn(closeRoute);
  const fnSync = useServerFn(syncClosureToGestaoClick);

  const { data, isLoading } = useQuery({
    queryKey: ["route", id],
    queryFn: () => fnGet({ data: { id } }),
  });
  const { data: cash } = useQuery({
    queryKey: ["route-cash", id],
    queryFn: () => fnCash({ data: { routeId: id } }),
  });

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ results: SyncResult[]; sent: number; failed: number } | null>(
    null,
  );

  const active = useMemo(
    () =>
      ((data?.deliveries ?? []) as any[]).filter(
        (d) => d.status !== "cancelado" && d.status !== "reagendado",
      ),
    [data],
  );

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, Entry> = {};
    for (const d of active) {
      const items: any[] = Array.isArray(d.order_payload?.items) ? d.order_payload.items : [];
      initial[d.id] = {
        outcome: normalizeOutcome(d.outcome),
        notes: d.outcome_notes ?? "",
        items: items.map((i) => ({
          description: String(i?.description ?? "Artigo"),
          delivered: true,
        })),
      };
    }
    setEntries(initial);
  }, [data, active]);

  if (isLoading || !data) return <div className="text-muted-foreground">A carregar…</div>;
  const r = data.route as any;

  const orders = new Map<string, any>(((cash?.orders ?? []) as any[]).map((o) => [o.id, o]));
  const forecastTotal = Number(cash?.forecast_total ?? 0);
  const realizedTotal = Number(cash?.realized_total ?? 0);
  const diffTotal = realizedTotal - forecastTotal;

  const alreadyClosed = r.status === "concluida";

  const counts = Object.values(entries).reduce<Record<string, number>>((acc, e) => {
    acc[e.outcome] = (acc[e.outcome] ?? 0) + 1;
    return acc;
  }, {});

  function setEntry(deliveryId: string, patch: Partial<Entry>) {
    setEntries((s) => ({ ...s, [deliveryId]: { ...s[deliveryId], ...patch } }));
  }

  async function runSync(deliveryIds?: string[]) {
    const res = await fnSync({
      data: deliveryIds?.length ? { routeId: id, deliveryIds } : { routeId: id },
    });
    setSummary(res as any);
    return res;
  }

  async function handleSubmit() {
    const invalid = Object.entries(entries).filter(
      ([, e]) => e.outcome !== "entregue" && !e.notes.trim(),
    );
    if (invalid.length > 0) {
      toast.error("Justificação obrigatória nas parciais, reagendadas e canceladas");
      return;
    }
    setBusy(true);
    try {
      await fnClose({
        data: {
          routeId: id,
          outcomes: Object.entries(entries).map(([delivery_id, e]) => ({
            delivery_id,
            outcome: e.outcome,
            outcome_notes: e.notes.trim() || null,
            partial_items: e.outcome === "entregue_parcial" ? e.items : null,
          })),
        },
      });
      toast.success("Rota fechada — a enviar para o Gestão Click…");
      try {
        const res = await runSync();
        if (res.failed > 0) toast.warning(`${res.failed} nota(s) falharam no Gestão Click`);
        else toast.success("Gestão Click atualizado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao sincronizar Gestão Click");
      }
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro a fechar rota");
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (!summary) return;
    const failed = summary.results.filter((x) => !x.ok).map((x) => x.delivery_id);
    if (failed.length === 0) return;
    setBusy(true);
    try {
      const res = await runSync(failed);
      toast[res.failed > 0 ? "warning" : "success"](
        res.failed > 0 ? `Ainda falham ${res.failed}` : "Todas as notas enviadas",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no reenvio");
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <div className="space-y-4 max-w-3xl pb-24">
        <Link
          to="/rotas/$id"
          params={{ id }}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar à rota
        </Link>
        <h1 className="text-2xl font-bold">Resumo do fecho — {r.zone}</h1>

        <Card className="p-4 grid grid-cols-3 gap-3 text-center">
          <Metric label="Previsto" value={forecastTotal} />
          <Metric label="Realizado" value={realizedTotal} tone="emerald" />
          <Metric label="Diferença" value={diffTotal} tone={Math.abs(diffTotal) < 0.01 ? "muted" : "amber"} />
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="font-semibold text-sm">Estados</h2>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
              <Badge key={o} variant="outline">
                {OUTCOME_LABEL[o]}: {counts[o] ?? 0}
              </Badge>
            ))}
          </div>
          {cash?.other_methods?.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(cash.other_methods as any[]).map((m) => (
                <Badge key={m.method_name} variant="secondary">
                  {m.method_name}: {formatEUR(m.amount)}
                </Badge>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold text-sm">Envio para o Gestão Click</h2>
            <Badge variant={summary.failed > 0 ? "destructive" : "default"}>
              {summary.sent} enviadas · {summary.failed} falhadas
            </Badge>
          </div>
          <div className="space-y-1.5">
            {summary.results.map((res) => (
              <div key={res.delivery_id} className="flex items-start gap-2 text-sm border rounded-md p-2">
                {res.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 mt-0.5" />
                )}
                <span className="font-medium">#{res.order_number}</span>
                {!res.ok && <span className="text-rose-700 text-xs">{res.error}</span>}
              </div>
            ))}
          </div>
          {summary.failed > 0 && (
            <Button onClick={handleRetry} disabled={busy} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" /> Reenviar falhadas
            </Button>
          )}
        </Card>

        <Link to="/rotas/$id" params={{ id }}>
          <Button>Voltar ao detalhe da rota</Button>
        </Link>
      </div>
    );
  }

  if (alreadyClosed) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="font-medium">Esta rota já foi fechada.</p>
        <div className="flex gap-2 justify-center">
          <Link to="/rotas/$id" params={{ id }}>
            <Button variant="outline">Voltar ao detalhe</Button>
          </Link>
          <Button onClick={() => runSync()} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-1" /> Reenviar ao Gestão Click
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl pb-28">
      <Link
        to="/rotas/$id"
        params={{ id }}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar à rota
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Fechar rota — {r.zone}</h1>
        <p className="text-sm text-muted-foreground">
          Confere previsto vs realizado de cada nota antes de fechar.
        </p>
      </div>

      <Card className="p-4 grid grid-cols-3 gap-3 text-center">
        <Metric label="Previsto" value={forecastTotal} />
        <Metric label="Realizado" value={realizedTotal} tone="emerald" />
        <Metric label="Diferença" value={diffTotal} tone={Math.abs(diffTotal) < 0.01 ? "muted" : "amber"} />
      </Card>

      {active.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Sem entregas para validar.</Card>
      ) : (
        <div className="space-y-3">
          {active.map((d: any) => {
            const e = entries[d.id];
            if (!e) return null;
            const o = orders.get(d.id);
            const forecast = Number(o?.forecast ?? 0);
            const realized = Number(o?.realized ?? 0);
            const diff = realized - forecast;
            const mismatch = Math.abs(diff) > 0.01;
            return (
              <Card key={d.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-semibold">
                      #{d.order_number} — {d.customer_name}
                    </div>
                    <div className="text-sm text-muted-foreground">{d.address}</div>
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    GC: {GC_LABEL[e.outcome]}
                  </Badge>
                </div>

                <div className="rounded-md border p-2.5 text-xs space-y-1">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                    <span>Previsto <b>{formatEUR(forecast)}</b></span>
                    <span>Realizado <b className="text-emerald-700">{formatEUR(realized)}</b></span>
                    <span className={mismatch ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                      Δ {formatEUR(diff)}
                    </span>
                  </div>
                  {(o?.payments ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(o.payments as any[]).map((p) => (
                        <Badge key={p.id} variant="secondary" className="text-[11px]">
                          {p.method_name}: {formatEUR(p.amount)}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {mismatch && (
                    <div className="flex items-center gap-1.5 text-amber-700 pt-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Discrepância entre previsto e recebido.
                    </div>
                  )}
                </div>

                <RadioGroup
                  value={e.outcome}
                  onValueChange={(v) => setEntry(d.id, { outcome: v as Outcome })}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                >
                  <OutcomeOption id={`${d.id}-ok`} value="entregue" label="Entregue" tone="emerald" current={e.outcome} />
                  <OutcomeOption id={`${d.id}-pa`} value="entregue_parcial" label="Parcial" tone="amber" current={e.outcome} />
                  <OutcomeOption id={`${d.id}-re`} value="reagendado" label="Reagendada" tone="sky" current={e.outcome} />
                  <OutcomeOption id={`${d.id}-ca`} value="cancelado" label="Cancelada" tone="rose" current={e.outcome} />
                </RadioGroup>

                {e.outcome === "entregue_parcial" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Artigos entregues</Label>
                    {e.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Sem artigos no snapshot da encomenda — descreve na justificação.
                      </p>
                    ) : (
                      e.items.map((it, idx) => (
                        <label
                          key={`${d.id}-item-${idx}`}
                          className="flex items-center gap-2 rounded-md border p-2 text-xs cursor-pointer"
                        >
                          <Checkbox
                            checked={it.delivered}
                            onCheckedChange={(c) =>
                              setEntry(d.id, {
                                items: e.items.map((x, i) =>
                                  i === idx ? { ...x, delivered: c === true } : x,
                                ),
                              })
                            }
                          />
                          <span className={it.delivered ? "" : "line-through text-muted-foreground"}>
                            {it.description}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}

                {e.outcome !== "entregue" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Justificação (obrigatória)</Label>
                    <Textarea
                      rows={2}
                      value={e.notes}
                      onChange={(ev) => setEntry(d.id, { notes: ev.target.value })}
                      placeholder="Motivo do reagendamento, cancelamento ou entrega parcial…"
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3 bg-muted/40">
        <div className="text-sm flex flex-wrap gap-1.5">
          {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
            <Badge key={o} variant="outline">
              {OUTCOME_LABEL[o]}: {counts[o] ?? 0}
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Link to="/rotas/$id" params={{ id }}>
            <Button variant="outline">Cancelar</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={busy || active.length === 0}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> {busy ? "A fechar…" : "Fechar e enviar ao GC"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function normalizeOutcome(v: string | null | undefined): Outcome {
  if (v === "entregue_parcial" || v === "reagendado" || v === "cancelado") return v;
  if (v === "nao_entregue") return "reagendado";
  return "entregue";
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "amber" | "muted";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${cls}`}>{formatEUR(value)}</div>
    </div>
  );
}

function OutcomeOption({
  id,
  value,
  label,
  tone,
  current,
}: {
  id: string;
  value: string;
  label: string;
  tone: "emerald" | "rose" | "amber" | "sky";
  current: string;
}) {
  const active = current === value;
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500 bg-emerald-50 text-emerald-900"
      : tone === "rose"
        ? "border-rose-500 bg-rose-50 text-rose-900"
        : tone === "sky"
          ? "border-sky-500 bg-sky-50 text-sky-900"
          : "border-amber-500 bg-amber-50 text-amber-900";
  return (
    <Label
      htmlFor={id}
      className={`flex items-center gap-2 rounded-md border p-2.5 cursor-pointer transition-colors ${active ? toneClass : "hover:bg-accent"}`}
    >
      <RadioGroupItem id={id} value={value} />
      <span className="text-sm font-medium">{label}</span>
    </Label>
  );
}
