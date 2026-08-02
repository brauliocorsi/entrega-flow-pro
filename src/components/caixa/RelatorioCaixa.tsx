import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCashLedger } from "@/lib/cash.functions";
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
import { StatTile } from "@/components/ui-kit/PageHeader";
import { formatEUR, formatDatePT, formatDateTimePT } from "@/lib/format";
import { Download, Search, X } from "lucide-react";

const ALL = "__all__";
type Kind = "todos" | "entrada" | "saida";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export function RelatorioCaixa() {
  const fn = useServerFn(getCashLedger);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [zone, setZone] = useState(ALL);
  const [person, setPerson] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [kind, setKind] = useState<Kind>("todos");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["cash-ledger", from, to],
    queryFn: () => fn({ data: { from, to } }),
    refetchOnWindowFocus: true,
  });

  const all = useMemo(() => (data?.movements ?? []) as any[], [data]);

  const zones = useMemo(
    () => Array.from(new Set(all.map((m) => m.zone).filter(Boolean))).sort(),
    [all],
  );
  const people = useMemo(
    () => Array.from(new Set(all.map((m) => m.responsible).filter(Boolean))).sort(),
    [all],
  );
  const methods = useMemo(
    () => Array.from(new Set(all.map((m) => m.method_name).filter(Boolean))).sort(),
    [all],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let balance = 0;
    return all
      .filter((m) => {
        if (kind !== "todos" && m.kind !== kind) return false;
        if (zone !== ALL && m.zone !== zone) return false;
        if (person !== ALL && m.responsible !== person) return false;
        if (method !== ALL && m.method_name !== method) return false;
        if (term) {
          const hay = [
            m.description,
            m.order_number,
            m.customer_name,
            m.zone,
            m.responsible,
            m.envelope_code,
            m.method_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .map((m) => {
        balance += m.kind === "entrada" ? Number(m.amount) : -Number(m.amount);
        return { ...m, balance: Math.round(balance * 100) / 100 };
      });
  }, [all, kind, zone, person, method, q]);

  const totalIn = rows
    .filter((r) => r.kind === "entrada")
    .reduce((a, r) => a + Number(r.amount), 0);
  const totalOut = rows.filter((r) => r.kind === "saida").reduce((a, r) => a + Number(r.amount), 0);

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows.filter((x) => x.kind === "entrada")) {
      map.set(r.method_name, (map.get(r.method_name) ?? 0) + Number(r.amount));
    }
    return Array.from(map, ([method_name, amount]) => ({
      method_name,
      amount,
      pct: totalIn > 0 ? (amount / totalIn) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);
  }, [rows, totalIn]);

  const hasFilters =
    zone !== ALL || person !== ALL || method !== ALL || kind !== "todos" || q !== "";

  function exportCsv() {
    const header = [
      "Data",
      "Tipo",
      "Descrição",
      "Encomenda",
      "Cliente",
      "Rota",
      "Data rota",
      "Responsável",
      "Envelope",
      "Forma",
      "Entrada",
      "Saída",
      "Saldo",
    ];
    const lines = rows.map((r) =>
      [
        formatDateTimePT(r.date),
        r.kind,
        r.description ?? "",
        r.order_number ?? "",
        r.customer_name ?? "",
        r.zone ?? "",
        r.route_date ? formatDatePT(r.route_date) : "",
        r.responsible ?? "",
        r.envelope_code ?? "",
        r.method_name ?? "",
        r.kind === "entrada" ? Number(r.amount).toFixed(2) : "",
        r.kind === "saida" ? Number(r.amount).toFixed(2) : "",
        Number(r.balance).toFixed(2),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = "\uFEFF" + [header.join(";"), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `conta-corrente-caixa-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Entradas" value={formatEUR(totalIn)} tone="positive" />
        <StatTile label="Saídas" value={`− ${formatEUR(totalOut)}`} tone="danger" />
        <StatTile
          label="Saldo do período"
          value={formatEUR(totalIn - totalOut)}
          tone={totalIn - totalOut >= 0 ? "default" : "warning"}
        />
      </div>

      <Card className="space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">De</Label>
            <Input
              type="date"
              className="mt-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Até</Label>
            <Input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Rota</Label>
            <Select value={zone} onValueChange={setZone}>
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
            <Select value={person} onValueChange={setPerson}>
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
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Pesquisar por encomenda, cliente, envelope, rota…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["todos", "entrada", "saida"] as Kind[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={kind === k ? "secondary" : "outline"}
              className="h-7 capitalize"
              onClick={() => setKind(k)}
            >
              {k === "todos" ? "Tudo" : k === "entrada" ? "Entradas" : "Saídas"}
            </Button>
          ))}
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-7 w-auto min-w-[150px]">
              <SelectValue placeholder="Forma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as formas</SelectItem>
              {methods.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setZone(ALL);
                setPerson(ALL);
                setMethod(ALL);
                setKind("todos");
                setQ("");
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Limpar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7"
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
        </div>

        {byMethod.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {byMethod.map((m) => (
              <Badge key={m.method_name} variant="outline" className="text-[10px]">
                {m.method_name}: {formatEUR(m.amount)} · {m.pct.toFixed(1)}%
              </Badge>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground">{rows.length} movimento(s)</div>
      </Card>

      {isLoading ? (
        <div className="text-muted-foreground">A carregar…</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem movimentos neste período.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-2 border-b bg-muted/40 px-3 py-2 text-[10px] uppercase text-muted-foreground md:grid">
            <span>Data</span>
            <span>Descrição</span>
            <span>Forma</span>
            <span className="text-right">Entrada</span>
            <span className="text-right">Saída</span>
            <span className="text-right">Saldo</span>
          </div>
          <div className="divide-y">
            {rows.map((r) => (
              <div
                key={`${r.kind}-${r.id}`}
                className="grid gap-1 px-3 py-2 text-xs md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:items-center md:gap-2"
              >
                <div className="text-muted-foreground">{formatDateTimePT(r.date)}</div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.description}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {[r.zone, r.route_date ? formatDatePT(r.route_date) : null, r.responsible]
                      .filter(Boolean)
                      .join(" · ")}
                    {r.envelope_code ? ` · ${r.envelope_code}` : ""}
                    {r.status ? ` · ${r.status}` : ""}
                  </div>
                </div>
                <div className="text-muted-foreground">{r.method_name}</div>
                <div className="tabular-nums font-semibold text-emerald-600 md:text-right">
                  {r.kind === "entrada" ? formatEUR(r.amount) : ""}
                </div>
                <div className="tabular-nums font-semibold text-rose-600 md:text-right">
                  {r.kind === "saida" ? `− ${formatEUR(r.amount)}` : ""}
                </div>
                <div className="tabular-nums font-semibold md:text-right">
                  {formatEUR(r.balance)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
