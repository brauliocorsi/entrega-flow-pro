import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getRouteWithDeliveries } from "@/lib/routes.functions";
import { closeRoute } from "@/lib/deliveries.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { formatEUR } from "@/lib/format";
import { toast } from "sonner";

type Outcome = "entregue" | "nao_entregue" | "entregue_parcial";

export const Route = createFileRoute("/_authenticated/rotas/$id/fechar")({
  head: () => ({ meta: [{ title: "Fechar rota — UP Agenda" }] }),
  component: CloseRoutePage,
});

function CloseRoutePage() {
  const { id } = useParams({ from: "/_authenticated/rotas/$id/fechar" });
  const navigate = useNavigate();
  const fnGet = useServerFn(getRouteWithDeliveries);
  const fnClose = useServerFn(closeRoute);

  const { data, isLoading } = useQuery(
    queryOptions({
      queryKey: ["route", id],
      queryFn: () => fnGet({ data: { id } }),
    }),
  );

  const [outcomes, setOutcomes] = useState<Record<string, { outcome: Outcome; notes: string }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, { outcome: Outcome; notes: string }> = {};
    for (const d of data.deliveries) {
      if (d.status === "cancelado" || d.status === "reagendado") continue;
      initial[d.id] = { outcome: (d.outcome as Outcome) ?? "entregue", notes: d.outcome_notes ?? "" };
    }
    setOutcomes(initial);
  }, [data]);

  if (isLoading || !data) return <div className="text-muted-foreground">A carregar…</div>;
  const { route: r, deliveries } = data;
  const active = deliveries.filter((d: any) => d.status !== "cancelado" && d.status !== "reagendado");

  if (r.status === "concluida" || r.status === "fechada") {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="font-medium">Esta rota já foi fechada.</p>
        <Link to="/rotas/$id" params={{ id }}>
          <Button variant="outline">Voltar ao detalhe</Button>
        </Link>
      </Card>
    );
  }

  const totalNaoEntregues = Object.values(outcomes).filter(
    (o) => o.outcome === "nao_entregue" || o.outcome === "entregue_parcial",
  ).length;

  async function handleSubmit() {
    setBusy(true);
    try {
      await fnClose({
        data: {
          routeId: id,
          outcomes: Object.entries(outcomes).map(([delivery_id, v]) => ({
            delivery_id,
            outcome: v.outcome,
            outcome_notes: v.notes.trim() || null,
          })),
        },
      });
      toast.success("Rota fechada com sucesso");
      if (totalNaoEntregues > 0) {
        toast.info(`${totalNaoEntregues} entrega(s) precisam de reagendamento`);
      }
      navigate({ to: "/rotas/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro a fechar rota");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/rotas/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Voltar à rota
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Fechar rota — {r.zone}</h1>
        <p className="text-sm text-muted-foreground">Confirma o resultado de cada entrega.</p>
      </div>

      {active.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Sem entregas para validar.</Card>
      ) : (
        <div className="space-y-3">
          {active.map((d: any) => {
            const o = outcomes[d.id];
            if (!o) return null;
            return (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <div className="font-semibold">#{d.order_number} — {d.customer_name}</div>
                    <div className="text-sm text-muted-foreground">{d.address}</div>
                  </div>
                  <Badge variant="outline">{formatEUR(d.total_value)} · {Number(d.volume_m3).toFixed(1)} m³</Badge>
                </div>
                <RadioGroup
                  value={o.outcome}
                  onValueChange={(v) => setOutcomes((s) => ({ ...s, [d.id]: { ...s[d.id], outcome: v as Outcome } }))}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  <OutcomeOption id={`${d.id}-ok`} value="entregue" label="Entregue" tone="emerald" current={o.outcome} />
                  <OutcomeOption id={`${d.id}-no`} value="nao_entregue" label="Não entregue" tone="rose" current={o.outcome} />
                  <OutcomeOption id={`${d.id}-pa`} value="entregue_parcial" label="Parcial" tone="amber" current={o.outcome} />
                </RadioGroup>
                {(o.outcome === "nao_entregue" || o.outcome === "entregue_parcial") && (
                  <div className="mt-3 space-y-1">
                    <Label className="text-xs">Motivo / notas</Label>
                    <Textarea
                      rows={2}
                      value={o.notes}
                      onChange={(e) => setOutcomes((s) => ({ ...s, [d.id]: { ...s[d.id], notes: e.target.value } }))}
                      placeholder="Ex.: cliente ausente, mudou de morada…"
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4 flex flex-wrap items-center justify-between gap-3 bg-muted/40">
        <div className="text-sm">
          {totalNaoEntregues > 0 ? (
            <span><b>{totalNaoEntregues}</b> entrega(s) ficarão pendentes de reagendamento.</span>
          ) : (
            <span>Todas as entregas marcadas como entregues.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/rotas/$id" params={{ id }}>
            <Button variant="outline">Cancelar</Button>
          </Link>
          <Button onClick={handleSubmit} disabled={busy || active.length === 0}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> {busy ? "A fechar…" : "Confirmar fecho"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function OutcomeOption({ id, value, label, tone, current }: { id: string; value: string; label: string; tone: "emerald" | "rose" | "amber"; current: string }) {
  const active = current === value;
  const toneClass =
    tone === "emerald" ? "border-emerald-500 bg-emerald-50 text-emerald-900" :
    tone === "rose" ? "border-rose-500 bg-rose-50 text-rose-900" :
    "border-amber-500 bg-amber-50 text-amber-900";
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
