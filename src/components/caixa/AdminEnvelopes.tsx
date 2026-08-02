import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAllSettlements } from "@/lib/cash.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEUR, formatDatePT, formatDateTimePT } from "@/lib/format";
import {
  PackageCheck,
  ArrowUpRight,
  ArrowDownLeft,
  User,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const EXPENSE_TONE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-rose-100 text-rose-800 border-rose-200",
};

type Filter = "todos" | "pendentes" | "conferidos";

const PAGE_SIZE = 10;
const ALL = "__all__";

export function AdminEnvelopes() {
  const fn = useServerFn(getAllSettlements);
  const [days, setDays] = useState(60);
  const [filter, setFilter] = useState<Filter>("pendentes");
  const [q, setQ] = useState("");
  const [zone, setZone] = useState<string>(ALL);
  const [person, setPerson] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["all-settlements", days],
    queryFn: () => fn({ data: { days } }),
    refetchOnWindowFocus: true,
  });

  const all = useMemo(() => (data?.settlements ?? []) as any[], [data]);

  const zones = useMemo(
    () => Array.from(new Set(all.map((r) => r.zone).filter(Boolean))).sort(),
    [all],
  );
  const people = useMemo(
    () =>
      Array.from(
        new Set(
          all.flatMap((r) =>
            [r.driver, r.assistant, r.settlement?.submitted_by_name].filter(Boolean),
          ),
        ),
      ).sort(),
    [all],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((r: any) => {
      const st = r.settlement;
      if (filter === "pendentes" && st?.status !== "entregue") return false;
      if (filter === "conferidos" && st?.status !== "conferida") return false;
      if (zone !== ALL && r.zone !== zone) return false;
      if (
        person !== ALL &&
        ![r.driver, r.assistant, st?.submitted_by_name].filter(Boolean).includes(person)
      )
        return false;
      if (from && String(r.route_date) < from) return false;
      if (to && String(r.route_date) > to) return false;
      if (term) {
        const hay = [
          st?.envelope_code,
          r.zone,
          r.driver,
          r.assistant,
          st?.submitted_by_name,
          formatDatePT(r.route_date),
          r.route_date,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [all, filter, zone, person, from, to, q]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const reset = () => setPage(1);
  const hasFilters =
    q !== "" || zone !== ALL || person !== ALL || from !== "" || to !== "" || filter !== "pendentes";

  if (isLoading) return <div className="text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-4">
      <Card className="p-5 text-center">
        <div className="text-xs uppercase text-muted-foreground">Pendente de conferência</div>
        <div className="text-4xl font-bold text-amber-600">
          {formatEUR(data?.pending_total ?? 0)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {data?.pending_count ?? 0} envelope(s)
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Pesquisar por código do envelope, rota ou responsável…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              reset();
            }}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Rota</Label>
            <Select
              value={zone}
              onValueChange={(v) => {
                setZone(v);
                reset();
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as rotas</SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Responsável</Label>
            <Select
              value={person}
              onValueChange={(v) => {
                setPerson(v);
                reset();
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">De</Label>
            <Input
              type="date"
              className="mt-1"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                reset();
              }}
            />
          </div>

          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Até</Label>
            <Input
              type="date"
              className="mt-1"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                reset();
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["pendentes", "conferidos", "todos"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "secondary" : "outline"}
              className="h-7 capitalize"
              onClick={() => {
                setFilter(f);
                reset();
              }}
            >
              {f}
            </Button>
          ))}
          <span className="mx-1" />
          {[30, 60, 180].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "secondary" : "outline"}
              className="h-7"
              onClick={() => {
                setDays(d);
                reset();
              }}
            >
              {d} dias
            </Button>
          ))}
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 ml-auto"
              onClick={() => {
                setQ("");
                setZone(ALL);
                setPerson(ALL);
                setFrom("");
                setTo("");
                setFilter("pendentes");
                reset();
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {rows.length} envelope(s) encontrados
          {rows.length > PAGE_SIZE ? ` · página ${current} de ${totalPages}` : ""}
        </div>
      </Card>

      {pageRows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem envelopes nesta seleção.
        </Card>
      ) : (
        pageRows.map((r: any) => <EnvelopeCard key={r.id} row={r} />)
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {current} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= totalPages}
            onClick={() => setPage(current + 1)}
          >
            Seguinte <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}


function EnvelopeCard({ row }: { row: any }) {
  const st = row.settlement;
  const conferida = st.status === "conferida";
  const diff = Number(st.cash_declared) - Number(st.cash_expected);
  const forecastDiff = Number(row.realized_total) - Number(row.forecast_total);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-mono font-bold text-sm">{st.envelope_code}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ background: row.color ?? "#3b82f6" }}
            />
            {row.zone} · {formatDatePT(row.route_date)}
          </div>
        </div>
        <Badge
          className={
            conferida
              ? "bg-sky-100 text-sky-800 border-sky-200"
              : "bg-amber-100 text-amber-800 border-amber-200"
          }
        >
          {conferida ? "Conferido" : "Aguarda conferência"}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
        <User className="h-3 w-3" />
        Responsáveis: {[row.driver, row.assistant].filter(Boolean).join(" · ") || "—"}
        {st.submitted_by_name ? ` · envelope entregue por ${st.submitted_by_name}` : ""}
        {st.submitted_at ? ` · ${formatDateTimePT(st.submitted_at)}` : ""}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Previsto</div>
          <div className="font-semibold text-sm">{formatEUR(row.forecast_total)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Realizado</div>
          <div className="font-semibold text-sm text-emerald-600">
            {formatEUR(row.realized_total)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Diferença</div>
          <div
            className={
              "font-semibold text-sm " +
              (Math.abs(forecastDiff) < 0.01 ? "text-muted-foreground" : "text-amber-600")
            }
          >
            {formatEUR(forecastDiff)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center rounded-lg bg-muted/40 py-2">
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Esperado</div>
          <div className="font-semibold text-sm">{formatEUR(Number(st.cash_expected))}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Declarado</div>
          <div className="font-semibold text-sm">{formatEUR(Number(st.cash_declared))}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Dif. dinheiro</div>
          <div
            className={
              "font-semibold text-sm " +
              (Math.abs(diff) < 0.01 ? "text-muted-foreground" : "text-amber-600")
            }
          >
            {formatEUR(diff)}
          </div>
        </div>
      </div>

      {row.other_methods.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.other_methods.map((m: any) => (
            <Badge
              key={m.method_name}
              variant="outline"
              className={
                m.confirmed
                  ? "text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "text-[10px]"
              }
            >
              {m.method_name}: {formatEUR(m.amount)}
              {m.confirmed ? " ✓" : " · por confirmar"}
            </Badge>
          ))}
        </div>
      )}

      <RecebimentosSection orders={row.orders ?? []} />

      <SaidasSection exits={row.exits ?? []} />

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-dashed py-2 text-center">
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Entradas</div>
          <div className="text-sm font-semibold text-emerald-600">
            {formatEUR(row.total_received)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Saídas</div>
          <div className="text-sm font-semibold text-rose-600">
            − {formatEUR(row.expenses_total)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Líquido</div>
          <div className="text-sm font-semibold tabular-nums">
            {formatEUR(Number(row.total_received) - Number(row.expenses_total))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <PackageCheck className="h-3 w-3" /> {row.orders_count} nota(s) de encomenda
        </span>
        <Link to="/entregas/caixa/$routeId" params={{ routeId: row.id }}>
          <Button size="sm" variant="outline" className="h-7">
            Ver caixa da rota
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground sm:hidden">{label}</div>
      <div className={`tabular-nums text-xs font-medium ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function RecebimentosSection({ orders }: { orders: any[] }) {
  if (orders.length === 0) return null;
  const sum = (k: string) => orders.reduce((a, o) => a + Number(o[k] ?? 0), 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-[11px] uppercase text-muted-foreground">
        <ArrowDownLeft className="h-3 w-3 text-emerald-600" /> Recebimentos por nota de encomenda
      </div>

      <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] gap-2 px-2 text-[10px] uppercase text-muted-foreground sm:grid">
        <span>Encomenda</span>
        <span>Total</span>
        <span>Produtos</span>
        <span>Entrega</span>
        <span>Montagem</span>
        <span>Recebido</span>
      </div>

      {orders.map((o: any) => (
        <div key={o.id} className="rounded-md border px-2 py-1.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] sm:items-center">
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <div className="truncate text-xs font-semibold">{o.order_number}</div>
              <div className="truncate text-[11px] text-muted-foreground">{o.customer_name}</div>
            </div>
            <Cell label="Total" value={formatEUR(o.total_value)} />
            <Cell label="Produtos" value={formatEUR(o.products_total)} />
            <Cell label="Entrega" value={formatEUR(o.delivery_total)} />
            <Cell label="Montagem" value={formatEUR(o.assembly_total)} />
            <Cell
              label="Recebido"
              value={formatEUR(o.realized)}
              tone={o.realized > 0 ? "text-emerald-600 font-semibold" : "text-muted-foreground"}
            />
          </div>

          {Math.abs(Number(o.diff ?? 0)) >= 0.01 && (
            <div className="mt-1 text-[11px] text-amber-600">
              Previsto {formatEUR(o.forecast)} · diferença {formatEUR(o.diff)}
            </div>
          )}

          {(o.payments ?? []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {o.payments.map((p: any) => (
                <Badge
                  key={p.id}
                  variant="outline"
                  className={
                    p.confirmed
                      ? "text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"
                      : "text-[10px]"
                  }
                >
                  {p.method_name}: {formatEUR(p.amount)}
                  {p.received_by_name ? ` · ${p.received_by_name}` : ""}
                  {p.confirmed ? " ✓" : " · por confirmar"}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-md bg-muted/40 px-2 py-1.5 sm:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] sm:items-center">
        <div className="col-span-2 text-[11px] font-semibold uppercase text-muted-foreground sm:col-span-1">
          Totais
        </div>
        <Cell label="Total" value={formatEUR(sum("total_value"))} />
        <Cell label="Produtos" value={formatEUR(sum("products_total"))} />
        <Cell label="Entrega" value={formatEUR(sum("delivery_total"))} />
        <Cell label="Montagem" value={formatEUR(sum("assembly_total"))} />
        <Cell label="Recebido" value={formatEUR(sum("realized"))} tone="text-emerald-600 font-semibold" />
      </div>
    </div>
  );
}

function SaidasSection({ exits }: { exits: any[] }) {
  if (exits.length === 0) return null;
  const total = exits
    .filter((e: any) => e.status !== "rejeitada")
    .reduce((a: number, e: any) => a + Number(e.amount), 0);

  return (
    <div className="space-y-1 rounded-lg border border-rose-200/70 bg-rose-50/40 p-2 dark:bg-rose-950/10">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] uppercase text-muted-foreground">
          <ArrowUpRight className="h-3 w-3 text-rose-600" /> Saídas de caixa
        </span>
        <span className="text-xs font-semibold tabular-nums text-rose-600">
          − {formatEUR(total)}
        </span>
      </div>
      {exits.map((e: any) => (
        <div key={e.id} className="space-y-0.5 rounded-md border bg-card px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{e.category}</span>
            <span className="flex items-center gap-1.5">
              <Badge className={`text-[10px] ${EXPENSE_TONE[e.status] ?? ""}`}>{e.status}</Badge>
              <span className="font-semibold tabular-nums text-rose-600">
                − {formatEUR(e.amount)}
              </span>
            </span>
          </div>
          <div className="text-muted-foreground">
            {e.description}
            {e.created_by_name ? ` · por ${e.created_by_name}` : ""} ·{" "}
            {formatDateTimePT(e.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}
