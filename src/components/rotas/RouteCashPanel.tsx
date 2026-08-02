import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteCash } from "@/lib/cash.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEUR } from "@/lib/format";
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Search,
} from "lucide-react";

type PayFilter = "todos" | "recebidos" | "por_confirmar" | "sem_recebimento" | "diferenca";

const PAY_FILTERS: { key: PayFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "recebidos", label: "Com recebimento" },
  { key: "por_confirmar", label: "Por confirmar" },
  { key: "sem_recebimento", label: "Sem recebimento" },
  { key: "diferenca", label: "Com diferença" },
];

/** Previsto vs realizado + movimentos de caixa da rota (recolhido por omissão). */
export function RouteCashPanel({ routeId }: { routeId: string }) {
  const fn = useServerFn(getRouteCash);
  const { data, isLoading } = useQuery({
    queryKey: ["route-cash", routeId],
    queryFn: () => fn({ data: { routeId } }),
    refetchInterval: 60_000,
  });

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PayFilter>("todos");
  const st = (data as any)?.settlement as any;
  // Envelope entregue/conferido: abre automaticamente para conferência.
  const submitted = !!st && st.status !== "aberta";
  useEffect(() => {
    if (submitted) setOpen(true);
  }, [submitted]);

  const visibleOrders = useMemo(() => {
    const orders = ((data as any)?.orders ?? []) as any[];
    const term = q.trim().toLowerCase();
    return orders.filter((o) => {
      const pays: any[] = o.payments ?? [];
      if (filter === "recebidos" && pays.length === 0) return false;
      if (filter === "sem_recebimento" && pays.length > 0) return false;
      if (filter === "por_confirmar" && !pays.some((p) => !p.confirmed)) return false;
      if (filter === "diferenca" && Math.abs(Number(o.diff)) <= 0.01) return false;
      if (!term) return true;
      return [o.order_number, o.customer_name, ...pays.map((p) => p.method_name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [data, q, filter]);

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
                ? "caixa conferido"
                : st.status === "entregue"
                  ? "caixa finalizado, por conferir"
                  : "caixa aberto"}
            </Badge>
          ) : (
            <Badge variant="outline">Caixa aberto · sem envelope</Badge>
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-medium">Encomendas — previsto vs realizado</h3>
          <span className="text-xs text-muted-foreground">
            {visibleOrders.length} de {data.orders.length}
          </span>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="Pesquisar por cliente, nº de encomenda ou método…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PAY_FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "secondary" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {data.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem encomendas nesta rota.</p>
        ) : visibleOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma encomenda corresponde à pesquisa ou ao filtro.
          </p>
        ) : (
          <div className="space-y-1.5">
            {visibleOrders.map((o: any) => {

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
