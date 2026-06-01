import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { suggestDeliveryFee } from "@/lib/fees.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDatePT, zipPrefix } from "@/lib/format";
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, WEEKDAYS_PT } from "@/lib/constants";
import { toast } from "sonner";
import { Search, Calculator, Calendar, Info, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conferencia")({
  head: () => ({ meta: [{ title: "Conferência de Valores — UP Agenda" }] }),
  component: ConferenciaPage,
});

type Result = Awaited<ReturnType<typeof suggestDeliveryFee>>;

function ConferenciaPage() {
  const suggestFn = useServerFn(suggestDeliveryFee);
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const cp = zipPrefix(zip);
    if (cp.length !== 4) {
      toast.error("Introduz os 4 primeiros dígitos do código postal");
      return;
    }
    setLoading(true);
    try {
      const res = await suggestFn({ data: { zip: cp } });
      setResult(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Calculator className="h-6 w-6" /> Conferência de Valores
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consulta a taxa de entrega sugerida e as rotas disponíveis para o código postal. Apenas
          sugestão — não cria agendamento.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <Label htmlFor="zip">Código postal (4 dígitos)</Label>
            <Input
              id="zip"
              inputMode="numeric"
              maxLength={8}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="3500"
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4 mr-1" /> Consultar
          </Button>
        </form>
      </Card>

      {result && (
        <>
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">
                Resultado para CP <strong className="text-foreground">{zipPrefix(zip)}</strong>
              </div>
              {result.fee ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                  Prioridade {result.fee.priority}
                </Badge>
              ) : null}
            </div>

            {result.fee ? (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Taxa sugerida
                </div>
                <div className="text-3xl font-bold tabular-nums mt-1">
                  {formatEUR(result.fee.fee)}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  {result.fee.label ? <strong>{result.fee.label} · </strong> : null}
                  Intervalo {result.fee.zip_start}–{result.fee.zip_end}
                </div>
                {result.fee.notes && (
                  <div className="text-xs text-muted-foreground mt-2 flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" /> {result.fee.notes}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Sem intervalo de taxa configurado para este CP. Contacta o administrador para
                adicionar.
              </div>
            )}

            {result.allMatches.length > 1 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">
                  {result.allMatches.length - 1} outro(s) intervalo(s) também correspondem
                </summary>
                <ul className="mt-2 space-y-1 pl-2">
                  {result.allMatches.slice(1).map((r) => (
                    <li key={r.id}>
                      {r.zip_start}–{r.zip_end} · {formatEUR(r.fee)} · prioridade {r.priority}
                      {r.label ? ` · ${r.label}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <h2 className="font-semibold">
                Rotas disponíveis ({result.routes.length})
              </h2>
            </div>
            {result.routes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem rotas disponíveis para este código postal.
              </p>
            ) : (
              <div className="space-y-2 max-h-[28rem] overflow-y-auto">
                {result.routes.map((r: any) => {
                  const d = new Date(r.route_date + "T00:00:00");
                  const restante = Number(r.max_capacity_m3) - Number(r.current_volume_m3);
                  const pct =
                    (Number(r.current_volume_m3) / Number(r.max_capacity_m3)) * 100;
                  return (
                    <div key={r.id} className="border rounded-md p-3 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {r.zone}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {WEEKDAYS_PT[d.getDay()]}, {formatDatePT(r.route_date)} ·{" "}
                            {r.driver ?? "Sem motorista"} · {restante.toFixed(1)} m³ livres
                          </div>
                        </div>
                        <Badge className={ROUTE_STATUS_TONE[r.status]}>
                          {ROUTE_STATUS_LABEL[r.status]}
                        </Badge>
                      </div>
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="text-xs text-muted-foreground border-t pt-2">
              Para agendar uma entrega usa o{" "}
              <Link to="/agendar" className="underline hover:text-foreground">
                fluxo de agendamento
              </Link>{" "}
              com o número da encomenda.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
