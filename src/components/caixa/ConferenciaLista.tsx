import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getSettlementsByDate,
  reviewExpense,
  confirmSettlementMethod,
  confirmPayment,
  closeSettlement,
} from "@/lib/cash.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEUR, formatDatePT } from "@/lib/format";
import {
  PackageCheck,
  Check,
  X,
  Receipt,
  Lock,
  ChevronDown,
  ChevronRight,
  Search,
  Wrench,
} from "lucide-react";

const EXPENSE_TONE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-rose-100 text-rose-800 border-rose-200",
};

const OUTCOME_TONE: Record<string, string> = {
  entregue: "bg-emerald-100 text-emerald-800 border-emerald-200",
  entregue_parcial: "bg-amber-100 text-amber-800 border-amber-200",
  nao_entregue: "bg-rose-100 text-rose-800 border-rose-200",
  reagendado: "bg-sky-100 text-sky-800 border-sky-200",
  cancelado: "bg-muted text-muted-foreground border-border",
};

const OUTCOME_LABEL: Record<string, string> = {
  entregue: "Entregue",
  entregue_parcial: "Entrega parcial",
  nao_entregue: "Não entregue",
  reagendado: "Reagendada",
  cancelado: "Cancelada",
  agendado: "Agendada",
  confirmado: "Confirmada",
};

/** Estado final da entrega: outcome tem prioridade, senão o status da encomenda. */
function deliveryState(o: any): { key: string; label: string; tone: string } {
  const key =
    o.status === "cancelado" || o.status === "reagendado" ? o.status : (o.outcome ?? o.status);
  return {
    key,
    label: OUTCOME_LABEL[key] ?? key,
    tone: OUTCOME_TONE[key] ?? "bg-muted text-muted-foreground border-border",
  };
}

type Filter = "todos" | "por_conferir" | "conferidos";

export function ConferenciaLista() {
  const qc = useQueryClient();
  const listFn = useServerFn(getSettlementsByDate);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", date],
    queryFn: () => listFn({ data: { date } }),
    refetchOnWindowFocus: true,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["settlements", date] });

  const all = useMemo(() => (data?.routes ?? []) as any[], [data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((r) => {
      const st = r.settlement;
      if (filter === "por_conferir" && st?.status === "conferida") return false;
      if (filter === "conferidos" && st?.status !== "conferida") return false;
      if (!term) return true;
      const hay = [
        r.zone,
        r.driver,
        r.assistant,
        st?.envelope_code,
        ...(r.orders ?? []).map((o: any) => `${o.order_number} ${o.customer_name}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [all, filter, q]);

  const totals = useMemo(() => {
    const forecast = rows.reduce((a, r) => a + Number(r.forecast_total ?? 0), 0);
    const realized = rows.reduce((a, r) => a + Number(r.realized_total ?? 0), 0);
    const inHand = rows.reduce((a, r) => a + Number(r.in_hand ?? 0), 0);
    const pending = rows.filter((r) => r.settlement && r.settlement.status !== "conferida").length;
    const pendingPayments = rows.reduce((a, r) => a + Number(r.pending_confirmations ?? 0), 0);
    return { forecast, realized, diff: realized - forecast, inHand, pending, pendingPayments };
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Envelopes e fecho de caixa
          </h2>
          <Input
            type="date"
            className="w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Metric label="Previsto" value={formatEUR(totals.forecast)} />
          <Metric label="Realizado" value={formatEUR(totals.realized)} tone="text-emerald-600" />
          <Metric
            label="Diferença"
            value={formatEUR(totals.diff)}
            tone={Math.abs(totals.diff) < 0.01 ? "text-muted-foreground" : "text-amber-600"}
          />
          <Metric label="A depositar" value={formatEUR(totals.inHand)} />
        </div>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Pesquisar por nota de encomenda, envelope, rota ou responsável…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["todos", "Todos"],
              ["por_conferir", "Por conferir"],
              ["conferidos", "Conferidos"],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "secondary" : "outline"}
              className="h-7"
              onClick={() => setFilter(f)}
            >
              {label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">
            {rows.length} rota(s)
            {totals.pendingPayments > 0
              ? ` · ${totals.pendingPayments} recebimento(s) por confirmar`
              : ""}
          </span>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">A carregar…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem rotas nesta seleção.
        </Card>
      ) : (
        rows.map((r) => <RouteRow key={r.id} row={r} onChanged={invalidate} />)
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 py-2">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className={"font-semibold text-sm " + (tone ?? "")}>{value}</div>
    </div>
  );
}

function RouteRow({ row: r, onChanged }: { row: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const reviewFn = useServerFn(reviewExpense);
  const confirmFn = useServerFn(confirmSettlementMethod);
  const closeFn = useServerFn(closeSettlement);

  const st = r.settlement;
  const conferida = st?.status === "conferida";
  const cashDiff = st ? Number(st.cash_declared) - Number(st.cash_expected) : 0;
  const forecast = Number(r.forecast_total ?? 0);
  const realized = Number(r.realized_total ?? 0);
  const diff = realized - forecast;
  const pending = Number(r.pending_confirmations ?? 0);

  const reviewMut = useMutation({
    mutationFn: (v: { id: string; status: "aprovada" | "rejeitada" }) => reviewFn({ data: v }),
    onSuccess: () => {
      toast.success("Despesa atualizada");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const confirmMut = useMutation({
    mutationFn: (v: { route_id: string; method_name: string; confirmed: boolean }) =>
      confirmFn({ data: v }),
    onSuccess: onChanged,
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const closeMut = useMutation({
    mutationFn: () => closeFn({ data: { route_id: r.id } }),
    onSuccess: () => {
      toast.success("Conferência fechada");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  async function openReceipt(path: string) {
    const { data: signed, error } = await supabase.storage
      .from("recibos-caixa")
      .createSignedUrl(path, 300);
    if (error || !signed) {
      toast.error("Não foi possível abrir o recibo");
      return;
    }
    window.open(signed.signedUrl, "_blank", "noopener");
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 space-y-2 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex items-start gap-2">
            {open ? (
              <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: r.color ?? "#3b82f6" }}
                />
                {r.zone}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDatePT(r.route_date)}
                {[r.driver, r.assistant].filter(Boolean).length > 0
                  ? ` · ${[r.driver, r.assistant].filter(Boolean).join(" · ")}`
                  : ""}
                {` · ${(r.orders ?? []).length} nota(s)`}
              </div>
              {st && <div className="font-mono text-xs font-semibold mt-0.5">{st.envelope_code}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {pending > 0 && !conferida && (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                {pending} por confirmar
              </Badge>
            )}
            {st ? (
              <Badge
                className={
                  conferida
                    ? "bg-sky-100 text-sky-800 border-sky-200"
                    : "bg-amber-100 text-amber-800 border-amber-200"
                }
              >
                {conferida ? "Conferida" : "Envelope entregue"}
              </Badge>
            ) : (
              <Badge variant="outline">Envelope em aberto</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center rounded-lg bg-muted/40 py-2">
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Previsto</div>
            <div className="font-semibold text-sm">{formatEUR(forecast)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Realizado</div>
            <div className="font-semibold text-sm text-emerald-600">{formatEUR(realized)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Diferença</div>
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
      </button>

      {open && (
        <div className="border-t p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Dinheiro</div>
              <div className="font-semibold text-sm">{formatEUR(r.cash_in)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">Despesas</div>
              <div className="font-semibold text-sm text-rose-600">
                − {formatEUR(r.expenses_total)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">A depositar</div>
              <div className="font-semibold text-sm text-emerald-600">{formatEUR(r.in_hand)}</div>
            </div>
          </div>

          {st && Math.abs(cashDiff) >= 0.01 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Declarado {formatEUR(Number(st.cash_declared))} · esperado{" "}
              {formatEUR(Number(st.cash_expected))} · diferença{" "}
              <strong>{formatEUR(cashDiff)}</strong>
            </div>
          )}

          <OrdersList orders={r.orders ?? []} locked={conferida} onChanged={onChanged} />

          {r.other_methods.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase text-muted-foreground">
                Conciliação de métodos
              </div>
              {r.other_methods.map((m: any) => (
                <div
                  key={m.method_name}
                  className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                >
                  <span>{m.method_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatEUR(m.amount)}</span>
                    <Button
                      size="sm"
                      variant={m.confirmed ? "secondary" : "outline"}
                      className="h-7"
                      disabled={!st || conferida || confirmMut.isPending}
                      onClick={() =>
                        confirmMut.mutate({
                          route_id: r.id,
                          method_name: m.method_name,
                          confirmed: !m.confirmed,
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {m.confirmed ? "Confirmado" : "Confirmar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {r.expenses.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase text-muted-foreground">Saídas de caixa</div>
              {r.expenses.map((e: any) => (
                <div key={e.id} className="rounded-md border px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">
                      {e.category} · {formatEUR(Number(e.amount))}
                    </span>
                    <Badge className={`text-[10px] ${EXPENSE_TONE[e.status] ?? ""}`}>
                      {e.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.description}
                    {e.created_by_name ? ` · ${e.created_by_name}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => openReceipt(e.receipt_path)}
                    >
                      <Receipt className="h-3.5 w-3.5 mr-1" /> Recibo
                    </Button>
                    {!conferida && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={e.status === "aprovada" || reviewMut.isPending}
                          onClick={() => reviewMut.mutate({ id: e.id, status: "aprovada" })}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-rose-600"
                          disabled={e.status === "rejeitada" || reviewMut.isPending}
                          onClick={() => reviewMut.mutate({ id: e.id, status: "rejeitada" })}
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Rejeitar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {st && !conferida && (
            <Button size="sm" className="w-full" disabled={closeMut.isPending} onClick={() => closeMut.mutate()}>
              <Lock className="h-4 w-4 mr-1" /> Fechar conferência
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function OrdersList({
  orders,
  locked,
  onChanged,
}: {
  orders: any[];
  locked: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const confirmPayFn = useServerFn(confirmPayment);
  const payMut = useMutation({
    mutationFn: (v: { payment_id: string; confirmed: boolean }) => confirmPayFn({ data: v }),
    onSuccess: () => {
      toast.success("Recebimento atualizado");
      onChanged();
      qc.invalidateQueries({ queryKey: ["route-cash"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao confirmar"),
  });

  if (orders.length === 0)
    return (
      <div className="text-xs text-muted-foreground">Sem notas de encomenda nesta rota.</div>
    );

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase text-muted-foreground">
        Notas de encomenda ({orders.length})
      </div>
      {orders.map((o: any) => {
        const state = deliveryState(o);
        return (
          <div key={o.id} className="rounded-md border px-3 py-2 text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">
                #{o.order_number} · {o.customer_name}
              </span>
              <span className="flex items-center gap-1">
                {o.has_service_request && (
                  <Badge className="text-[10px] bg-violet-100 text-violet-800 border-violet-200">
                    <Wrench className="h-3 w-3 mr-1" /> Assistência
                  </Badge>
                )}
                <Badge className={`text-[10px] ${state.tone}`}>{state.label}</Badge>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Previsto</div>
                <div className="font-semibold">{formatEUR(o.forecast)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Realizado</div>
                <div className="font-semibold text-emerald-600">{formatEUR(o.realized)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Diferença</div>
                <div
                  className={
                    "font-semibold " +
                    (Math.abs(Number(o.diff)) < 0.01 ? "text-muted-foreground" : "text-amber-600")
                  }
                >
                  {formatEUR(o.diff)}
                </div>
              </div>
            </div>

            {(o.payments ?? []).length === 0 ? (
              <div className="text-[11px] text-muted-foreground">Sem recebimentos registados.</div>
            ) : (
              <div className="space-y-1">
                {(o.payments ?? []).map((p: any) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                  >
                    <span>
                      {p.method_name}: <strong>{formatEUR(p.amount)}</strong>
                      {p.received_by_name ? ` · ${p.received_by_name}` : ""}
                    </span>
                    <Button
                      size="sm"
                      variant={p.confirmed ? "secondary" : "outline"}
                      className="h-6 text-[11px]"
                      disabled={locked || payMut.isPending}
                      onClick={() => payMut.mutate({ payment_id: p.id, confirmed: !p.confirmed })}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {p.confirmed ? "Confirmado" : "Confirmar"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {(o.service_requests ?? []).length > 0 && (
              <div className="text-[11px] text-violet-800">
                {(o.service_requests ?? [])
                  .map((s: any) => `${s.status}: ${s.description}`)
                  .join(" · ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
