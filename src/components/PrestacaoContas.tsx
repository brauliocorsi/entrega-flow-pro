import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getSettlementsByDate,
  reviewExpense,
  confirmSettlementMethod,
  closeSettlement,
} from "@/lib/cash.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEUR } from "@/lib/format";
import { PackageCheck, Check, X, Receipt, Lock } from "lucide-react";

const EXPENSE_TONE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-rose-100 text-rose-800 border-rose-200",
};

export function PrestacaoContas() {
  const qc = useQueryClient();
  const listFn = useServerFn(getSettlementsByDate);
  const reviewFn = useServerFn(reviewExpense);
  const confirmFn = useServerFn(confirmSettlementMethod);
  const closeFn = useServerFn(closeSettlement);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["settlements", date],
    queryFn: () => listFn({ data: { date } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["settlements", date] });

  const reviewMut = useMutation({
    mutationFn: (v: { id: string; status: "aprovada" | "rejeitada" }) => reviewFn({ data: v }),
    onSuccess: () => {
      toast.success("Despesa atualizada");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const confirmMut = useMutation({
    mutationFn: (v: { route_id: string; method_name: string; confirmed: boolean }) =>
      confirmFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const closeMut = useMutation({
    mutationFn: (route_id: string) => closeFn({ data: { route_id } }),
    onSuccess: () => {
      toast.success("Conferência fechada");
      invalidate();
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
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <PackageCheck className="h-5 w-5" /> Prestação de contas
        </h2>
        <Input
          type="date"
          className="w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : !data || data.routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem rotas nesta data.</p>
      ) : (
        <div className="space-y-3">
          {data.routes.map((r: any) => {
            const st = r.settlement;
            const diff = st ? Number(st.cash_declared) - Number(st.cash_expected) : 0;
            const conferida = st?.status === "conferida";
            return (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: r.color ?? "#3b82f6" }}
                    />
                    {r.zone}
                    <span className="text-xs text-muted-foreground">
                      {[r.driver, r.assistant].filter(Boolean).join(" · ")}
                    </span>
                  </div>
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

                {st && (
                  <div className="font-mono text-sm font-semibold">{st.envelope_code}</div>
                )}

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
                    <div className="font-semibold text-sm text-emerald-600">
                      {formatEUR(r.in_hand)}
                    </div>
                  </div>
                </div>

                {st && Math.abs(diff) >= 0.01 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Declarado {formatEUR(Number(st.cash_declared))} · diferença{" "}
                    <strong>{formatEUR(diff)}</strong>
                  </div>
                )}

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
                    <div className="text-[11px] uppercase text-muted-foreground">
                      Saídas de caixa
                    </div>
                    {r.expenses.map((e: any) => (
                      <div key={e.id} className="rounded-md border px-3 py-2 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">
                            {e.category} · {formatEUR(Number(e.amount))}
                          </span>
                          <Badge className={`text-[10px] ${EXPENSE_TONE[e.status]}`}>
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
                                onClick={() =>
                                  reviewMut.mutate({ id: e.id, status: "aprovada" })
                                }
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-rose-600"
                                disabled={e.status === "rejeitada" || reviewMut.isPending}
                                onClick={() =>
                                  reviewMut.mutate({ id: e.id, status: "rejeitada" })
                                }
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
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={closeMut.isPending}
                    onClick={() => closeMut.mutate(r.id)}
                  >
                    <Lock className="h-4 w-4 mr-1" /> Fechar conferência
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
