import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAllCashByStaff } from "@/lib/cash.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDatePT, formatDateTimePT } from "@/lib/format";
import {
  Wallet,
  ChevronDown,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  User,
} from "lucide-react";

const EXPENSE_TONE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-rose-100 text-rose-800 border-rose-200",
};

export function AdminCaixaGlobal() {
  const fn = useServerFn(getAllCashByStaff);
  const [days, setDays] = useState(45);
  const { data, isLoading } = useQuery({
    queryKey: ["all-cash-by-staff", days],
    queryFn: () => fn({ data: { days } }),
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="text-muted-foreground">A carregar…</div>;

  const staff = data?.staff ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="Em mãos (total)" value={formatEUR(data?.total_in_hand ?? 0)} tone="text-emerald-600" />
        <Metric label="Entradas dinheiro" value={formatEUR(data?.total_cash_in ?? 0)} />
        <Metric label="Saídas" value={formatEUR(data?.total_expenses ?? 0)} tone="text-rose-600" />
        <Metric label="Saídas por aprovar" value={String(data?.pending_expenses ?? 0)} tone="text-amber-600" />
      </div>

      <div className="flex gap-1.5">
        {[15, 45, 90].map((d) => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? "secondary" : "outline"}
            className="h-7"
            onClick={() => setDays(d)}
          >
            {d} dias
          </Button>
        ))}
      </div>

      {staff.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem movimentos de caixa neste período.
        </Card>
      ) : (
        staff.map((s: any) => <StaffCard key={s.name} staff={s} />)
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}

function StaffCard({ staff }: { staff: any }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-4 space-y-3">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <div className="font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            {staff.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {staff.open_routes} rota(s) por prestar contas
            {staff.pending_expenses > 0 ? ` · ${staff.pending_expenses} saída(s) por aprovar` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className="text-[11px] uppercase text-muted-foreground">Em mãos</div>
            <div className="font-bold text-emerald-600">{formatEUR(staff.in_hand)}</div>
          </div>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t pt-3">
          {staff.routes.map((r: any) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: r.color ?? "#3b82f6" }}
                  />
                  {r.zone}
                  <span className="text-xs text-muted-foreground">{formatDatePT(r.route_date)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={r.is_open ? "outline" : "secondary"}>
                    {r.is_open
                      ? "Caixa aberta"
                      : r.settlement?.status === "conferida"
                        ? "Conferida"
                        : "Envelope entregue"}
                  </Badge>
                  <Link to="/entregas/caixa/$routeId" params={{ routeId: r.id }}>
                    <Button size="sm" variant="outline" className="h-7">
                      Abrir
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground">Dinheiro</div>
                  <div className="font-semibold text-sm">{formatEUR(r.cash_in)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground">Saídas</div>
                  <div className="font-semibold text-sm text-rose-600">
                    − {formatEUR(r.expenses_total)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground">Em mãos</div>
                  <div className="font-semibold text-sm text-emerald-600">{formatEUR(r.in_hand)}</div>
                </div>
              </div>

              {r.entries.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase text-muted-foreground flex items-center gap-1">
                    <ArrowDownLeft className="h-3 w-3 text-emerald-600" /> Entradas
                  </div>
                  {r.entries.map((e: any) => (
                    <div key={e.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">
                        {e.method_name}
                        {e.received_by_name ? ` · ${e.received_by_name}` : ""}
                      </span>
                      <span className="font-semibold tabular-nums">{formatEUR(e.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {r.exits.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] uppercase text-muted-foreground flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-rose-600" /> Saídas
                  </div>
                  {r.exits.map((e: any) => (
                    <div key={e.id} className="rounded-md border px-2 py-1.5 text-xs space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{e.category}</span>
                        <span className="flex items-center gap-1.5">
                          <Badge className={`text-[10px] ${EXPENSE_TONE[e.status] ?? ""}`}>
                            {e.status}
                          </Badge>
                          <span className="font-semibold text-rose-600 tabular-nums">
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
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
