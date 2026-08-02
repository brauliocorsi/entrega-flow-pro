import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteCash } from "@/lib/cash.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR } from "@/lib/format";
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";

/** Previsto vs realizado + movimentos de caixa da rota (recolhido por omissão). */
export function RouteCashPanel({ routeId }: { routeId: string }) {
  const fn = useServerFn(getRouteCash);
  const { data, isLoading } = useQuery({
    queryKey: ["route-cash", routeId],
    queryFn: () => fn({ data: { routeId } }),
    refetchInterval: 60_000,
  });

  const [open, setOpen] = useState(false);
  const st = (data as any)?.settlement as any;
  // Envelope entregue/conferido: abre automaticamente para conferência.
  const submitted = !!st && st.status !== "aberta";
  useEffect(() => {
    if (submitted) setOpen(true);
  }, [submitted]);

  if (isLoading) return null;
  if (!data) return null;

  const diff = Number(data.realized_total) - Number(data.forecast_total);

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Caixa da rota
        </h2>
        <div className="flex items-center gap-2">
          {st ? (
            <Badge variant={st.status === "conferida" ? "default" : "secondary"}>
              Envelope {st.envelope_code} ·{" "}
              {st.status === "conferida"
                ? "conferido"
                : st.status === "entregue"
                  ? "entregue, por conferir"
                  : "aberto"}
            </Badge>
          ) : (
            <Badge variant="outline">Sem envelope</Badge>
          )}
          <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen((v) => !v)}>
            <ChevronDown
              className={`h-4 w-4 mr-1 transition-transform ${open ? "rotate-180" : ""}`}
            />
            {open ? "Ocultar" : "Ver recebimentos"}
          </Button>
        </div>
      </div>

      {!open ? null : (
        <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <Metric label="Previsto" value={data.forecast_total} />
        <Metric label="Realizado" value={data.realized_total} tone="emerald" />
        <Metric
          label="Diferença"
          value={diff}
          tone={Math.abs(diff) < 0.01 ? "muted" : "amber"}
        />
        <Metric label="Em mãos" value={data.in_hand} />
      </div>


      {data.other_methods.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.other_methods.map((m: any) => (
            <Badge key={m.method_name} variant="outline" className="text-[11px]">
              {m.method_name}: {formatEUR(m.amount)}{" "}
              {m.confirmed ? (
                <CheckCircle2 className="h-3 w-3 ml-1 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-3 w-3 ml-1 text-amber-600" />
              )}
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Encomendas — previsto vs realizado</h3>
        {data.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem encomendas nesta rota.</p>
        ) : (
          <div className="space-y-1.5">
            {data.orders.map((o: any) => {
              const bad = Math.abs(o.diff) > 0.01;
              return (
                <div
                  key={o.id}
                  className={`rounded-md border p-2.5 text-sm ${bad ? "border-amber-300 bg-amber-50/50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">
                      #{o.order_number} · {o.customer_name}
                    </span>
                    <span className="tabular-nums text-xs">
                      Previsto {formatEUR(o.forecast)} · Recebido{" "}
                      <b className="text-emerald-700">{formatEUR(o.realized)}</b>
                      {bad && (
                        <span className="text-amber-700"> · Δ {formatEUR(o.diff)}</span>
                      )}
                    </span>
                  </div>
                  {o.payments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {o.payments.map((p: any) => (
                        <Badge
                          key={p.id}
                          variant="outline"
                          className={`text-[11px] ${p.confirmed ? "border-emerald-300 text-emerald-800" : "border-amber-300 text-amber-800"}`}
                        >
                          {p.method_name}: {formatEUR(p.amount)}
                          {p.confirmed ? " ✓" : " • por confirmar"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Movimentos de caixa</h3>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border p-2.5 flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
            Entradas em dinheiro
            <span className="ml-auto font-semibold tabular-nums">{formatEUR(data.cash_in)}</span>
          </div>
          <div className="rounded-md border p-2.5 flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4 text-rose-600" />
            Saídas
            <span className="ml-auto font-semibold tabular-nums">
              {formatEUR(data.expenses_total)}
            </span>
          </div>
        </div>
        {data.expenses.length > 0 && (
          <div className="space-y-1">
            {data.expenses.map((e: any) => (
              <div key={e.id} className="flex items-center gap-2 text-xs border rounded-md p-2">
                <span className="font-medium capitalize">{e.category}</span>
                <span className="text-muted-foreground truncate">{e.description}</span>
                <span className="ml-auto tabular-nums">{formatEUR(e.amount)}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {e.status}
                </Badge>
                {e.created_by_name && (
                  <span className="text-muted-foreground">{e.created_by_name}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </Card>

  );
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
    <div className="rounded-lg border p-2.5">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${cls}`}>{formatEUR(value)}</div>
    </div>
  );
}
