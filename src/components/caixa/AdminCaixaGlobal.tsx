import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAllCashByRoute } from "@/lib/cash.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatTile, FilterBar } from "@/components/ui-kit/PageHeader";
import { formatEUR, formatDatePT, formatDateTimePT } from "@/lib/format";
import {
  ChevronDown,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  Search,
} from "lucide-react";

const EXPENSE_TONE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-rose-100 text-rose-800 border-rose-200",
};

const STATE_LABEL: Record<string, string> = {
  aberto: "Caixa aberto",
  entregue: "Envelope entregue",
  conferido: "Conferido",
};

const STATE_TONE: Record<string, string> = {
  aberto: "bg-emerald-100 text-emerald-800 border-emerald-200",
  entregue: "bg-amber-100 text-amber-800 border-amber-200",
  conferido: "bg-sky-100 text-sky-800 border-sky-200",
};

type StateFilter = "todos" | "aberto" | "entregue" | "conferido";

const FILTERS: { key: StateFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "aberto", label: "Abertos" },
  { key: "entregue", label: "Por conferir" },
  { key: "conferido", label: "Conferidos" },
];

/** Lista de caixas — um por rota — para admin/logística. */
export function AdminCaixaGlobal() {
  const fn = useServerFn(getAllCashByRoute);
  const [days, setDays] = useState(45);
  const [state, setState] = useState<StateFilter>("todos");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["all-cash-by-route", days],
    queryFn: () => fn({ data: { days } }),
    refetchOnWindowFocus: true,
  });

  const routes = useMemo(() => {
    const list = ((data?.routes ?? []) as any[]).filter((r) =>
      state === "todos" ? true : r.cash_state === state,
    );
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((r) =>
      [r.zone, r.responsible, r.envelope_code, r.route_date]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data, state, q]);

  if (isLoading) return <div className="text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="Em mãos (caixas abertos)"
          value={formatEUR(data?.total_in_hand ?? 0)}
          tone="positive"
        />
        <StatTile label="Caixas abertos" value={String(data?.open_count ?? 0)} tone="warning" />
        <StatTile label="Entradas dinheiro" value={formatEUR(data?.total_cash_in ?? 0)} />
        <StatTile
          label="Saídas"
          value={formatEUR(data?.total_expenses ?? 0)}
          tone="danger"
        />
      </div>

      <FilterBar>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Pesquisar por zona, responsável ou envelope…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={state === f.key ? "secondary" : "outline"}
              className="h-8 text-xs"
              onClick={() => setState(f.key)}
            >
              {f.label}
            </Button>
          ))}
          {[15, 45, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "ghost"}
              className="h-8 text-xs"
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </FilterBar>

      {routes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum caixa corresponde aos filtros.
        </Card>
      ) : (
        <div className="space-y-2">
          {routes.map((r) => (
            <RouteCashRow key={r.id} route={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function hasDiscrepancy(r: any) {
  const diff = Number(r.realized_total ?? 0) - Number(r.forecast_total ?? 0);
  return Math.abs(diff) >= 0.01;
}

function RouteCashRow({ route: r }: { route: any }) {
  const [open, setOpen] = useState(false);
  const diff = Number(r.realized_total ?? 0) - Number(r.forecast_total ?? 0);
  const discrepancy = hasDiscrepancy(r);

  return (
    <Card className={`overflow-hidden ${discrepancy ? "border-amber-300 ring-1 ring-amber-100" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
      >
        <span
          className="h-8 w-1.5 shrink-0 rounded-full"
          style={{ background: r.color ?? "#3b82f6" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{r.zone}</span>
            <Badge variant="outline" className={`text-[10px] ${STATE_TONE[r.cash_state]}`}>
              {STATE_LABEL[r.cash_state]}
            </Badge>
            {discrepancy && (
              <Badge className="border-amber-200 bg-amber-100 text-[10px] text-amber-800">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Divergência {formatEUR(diff)}
              </Badge>
            )}
            {r.envelope_code && (
              <span className="font-mono text-[11px] text-muted-foreground">
                {r.envelope_code}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{formatDatePT(r.route_date)}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" /> {r.responsible}
            </span>
            {r.pending_expenses > 0 && (
              <Badge className="border-amber-200 bg-amber-100 text-[10px] text-amber-800">
                {r.pending_expenses} saída(s) por aprovar
              </Badge>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase text-muted-foreground">Em mãos</div>
          <div className="text-lg font-bold text-emerald-600">{formatEUR(r.in_hand)}</div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Previsto" value={formatEUR(r.forecast_total ?? 0)} />
            <StatTile
              label="Realizado"
              value={formatEUR(r.realized_total ?? 0)}
              tone="positive"
            />
            <StatTile
              label="Diferença"
              value={formatEUR(diff)}
              tone={Math.abs(diff) < 0.01 ? "default" : "warning"}
            />
            <StatTile label="Saídas" value={formatEUR(r.expenses_total)} tone="danger" />
          </div>

          {r.other_methods?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.other_methods.map((m: any) => (
                <Badge key={m.method_name} variant="outline" className="text-[11px]">
                  {m.method_name}: {formatEUR(m.amount)}
                  {m.confirmed ? " ✓" : " • por conciliar"}
                </Badge>
              ))}
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" /> Entradas
            </div>
            {r.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem recebimentos.</p>
            ) : (
              <div className="divide-y">
                {r.entries.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="font-medium">{e.method_name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {e.received_by_name ?? "—"} · {formatDateTimePT(e.created_at)}
                    </span>
                    <span className="ml-auto tabular-nums font-semibold">
                      {formatEUR(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
              <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" /> Saídas
            </div>
            {r.exits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem saídas registadas.</p>
            ) : (
              <div className="divide-y">
                {r.exits.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="font-medium">{e.category}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {e.description}
                    </span>
                    <Badge
                      variant="outline"
                      className={`ml-auto text-[10px] capitalize ${EXPENSE_TONE[e.status] ?? ""}`}
                    >
                      {e.status}
                    </Badge>
                    <span className="tabular-nums font-semibold text-rose-600">
                      − {formatEUR(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to="/entregas/caixa/$routeId" params={{ routeId: r.id }}>
              <Button size="sm" variant="outline">
                Abrir caixa da rota
              </Button>
            </Link>
            <Link to="/rotas/$id" params={{ id: r.id }}>
              <Button size="sm" variant="ghost">
                Ver rota
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
