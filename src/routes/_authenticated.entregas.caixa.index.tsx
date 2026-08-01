import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCashRoutes } from "@/lib/cash.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEUR, formatDatePT } from "@/lib/format";
import { Wallet, ChevronRight, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregas/caixa/")({
  head: () => ({
    meta: [
      { title: "Caixa — UP Agenda" },
      {
        name: "description",
        content: "Valor em mãos por rota, despesas e envelopes por fechar.",
      },
    ],
  }),
  component: CaixaIndexPage,
});

function CaixaIndexPage() {
  const fn = useServerFn(getMyCashRoutes);
  const { data, isLoading } = useQuery({
    queryKey: ["my-cash-routes"],
    queryFn: () => fn({ data: { days: 30 } }),
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="text-muted-foreground">A carregar…</div>;

  const open = (data?.routes ?? []).filter(
    (r: any) => !r.settlement || r.settlement.status === "aberta",
  );

  return (
    <div className="space-y-4 pb-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Caixa
        </h1>
        <p className="text-sm text-muted-foreground">
          Rotas com envelope por fechar e valor em dinheiro à tua responsabilidade.
        </p>
      </div>

      <Card className="p-5 text-center">
        <div className="text-xs uppercase text-muted-foreground">Total em mãos</div>
        <div className="text-4xl font-bold text-emerald-600">
          {formatEUR(data?.total_in_hand ?? 0)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {open.length} rota(s) por prestar contas
        </div>
      </Card>

      {open.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Não tens caixa em aberto. Bom trabalho!
        </Card>
      ) : (
        open.map((r: any) => (
          <Link
            key={r.id}
            to="/entregas/caixa/$routeId"
            params={{ routeId: r.id }}
            className="block"
          >
            <Card className="p-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: r.color ?? "#3b82f6" }}
                    />
                    {r.zone}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDatePT(r.route_date)}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
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
                  <div className="text-[11px] uppercase text-muted-foreground">Em mãos</div>
                  <div className="font-semibold text-sm text-emerald-600">
                    {formatEUR(r.in_hand)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {r.other_methods.map((m: any) => (
                  <Badge key={m.method_name} variant="outline" className="text-[10px]">
                    {m.method_name}: {formatEUR(m.amount)}
                  </Badge>
                ))}
                {r.pending_expenses > 0 && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {r.pending_expenses} despesa(s) por
                    aprovar
                  </Badge>
                )}
              </div>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
