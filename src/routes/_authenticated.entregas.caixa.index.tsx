import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCashRoutes } from "@/lib/cash.functions";
import { useAuth } from "@/hooks/use-auth";
import { AdminCaixaGlobal } from "@/components/caixa/AdminCaixaGlobal";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, StatTile } from "@/components/ui-kit/PageHeader";
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
      { property: "og:title", content: "Caixa — UP Agenda" },
      {
        property: "og:description",
        content: "Valor em mãos por rota, despesas e envelopes por fechar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaixaIndexPage,
});

function CaixaIndexPage() {
  const { role } = useAuth();
  const isManager = role === "admin" || role === "logistico";
  const [picked, setScope] = useState<"minha" | "todos" | null>(null);
  const scope = picked ?? (isManager ? "todos" : "minha");

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6">
      <PageHeader
        icon={Wallet}
        title="Caixa"
        description={
          isManager && scope === "todos"
            ? "Valores em mãos da equipa, entradas das rotas e saídas registadas."
            : "Rotas com envelope por fechar e dinheiro à tua responsabilidade."
        }
        actions={
          isManager ? (
            <div className="flex rounded-xl border border-border p-0.5">
              <Button
                size="sm"
                variant={scope === "todos" ? "secondary" : "ghost"}
                className="h-8 rounded-lg"
                onClick={() => setScope("todos")}
              >
                Equipa
              </Button>
              <Button
                size="sm"
                variant={scope === "minha" ? "secondary" : "ghost"}
                className="h-8 rounded-lg"
                onClick={() => setScope("minha")}
              >
                A minha
              </Button>
            </div>
          ) : undefined
        }
      />

      {isManager && scope === "todos" ? <AdminCaixaGlobal /> : <MinhaCaixa />}
    </div>
  );
}

function MinhaCaixa() {
  const fn = useServerFn(getMyCashRoutes);
  const { data, isLoading } = useQuery({
    queryKey: ["my-cash-routes"],
    queryFn: () => fn({ data: { days: 30 } }),
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  const routes = (data?.routes ?? []) as any[];
  const open = routes.filter((r) => !r.settlement || r.settlement.status === "aberta");
  const settled = routes.filter((r) => r.settlement && r.settlement.status !== "aberta");

  const cashIn = open.reduce((a, r) => a + Number(r.cash_in ?? 0), 0);
  const expenses = open.reduce((a, r) => a + Number(r.expenses_total ?? 0), 0);

  return (
    <div className="space-y-4">
      <Card className="p-5 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Em mãos (caixas por entregar)
        </div>
        <div className="text-4xl font-bold text-emerald-600">
          {formatEUR(data?.total_in_hand ?? 0)}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile label="Entradas" value={formatEUR(cashIn)} />
          <StatTile label="Saídas" value={`− ${formatEUR(expenses)}`} tone="danger" />
          <StatTile label="Caixas abertos" value={String(open.length)} tone="warning" />
        </div>
      </Card>

      <Tabs defaultValue="abertas">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="abertas">Caixas abertos ({open.length})</TabsTrigger>
          <TabsTrigger value="fechadas">Fechados ({settled.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="abertas" className="mt-3 space-y-2">
          {open.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Não tens caixa em aberto. Bom trabalho!
            </Card>
          ) : (
            open.map((r) => (
              <Link
                key={r.id}
                to="/entregas/caixa/$routeId"
                params={{ routeId: r.id }}
                className="block"
              >
                <Card className="p-4 transition-colors hover:bg-muted/50">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-semibold">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ background: r.color ?? "#3b82f6" }}
                        />
                        <span className="truncate">Caixa · {r.zone}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDatePT(r.route_date)} · envelope por entregar
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <div className="text-[11px] uppercase text-muted-foreground">Em mãos</div>
                        <div className="text-lg font-bold text-emerald-600">
                          {formatEUR(r.in_hand)}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border p-2">
                      <div className="uppercase text-muted-foreground">Previsto</div>
                      <div className="font-semibold tabular-nums">
                        {formatEUR(r.forecast_total ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border p-2">
                      <div className="uppercase text-muted-foreground">Realizado</div>
                      <div className="font-semibold tabular-nums text-emerald-600">
                        {formatEUR(r.realized_total ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Dinheiro {formatEUR(r.cash_in)}</span>
                    <span>·</span>
                    <span className="text-rose-600">Despesas − {formatEUR(r.expenses_total)}</span>
                    {r.other_methods?.map((m: any) => (
                      <Badge key={m.method_name} variant="outline" className="text-[10px]">
                        {m.method_name}: {formatEUR(m.amount)}
                      </Badge>
                    ))}
                    {r.pending_expenses > 0 && (
                      <Badge className="border-amber-200 bg-amber-100 text-[10px] text-amber-800">
                        <AlertTriangle className="mr-1 h-3 w-3" /> {r.pending_expenses} por aprovar
                      </Badge>
                    )}
                  </div>
                </Card>
              </Link>
            ))
          )}
        </TabsContent>


        <TabsContent value="fechadas" className="mt-3 space-y-2">
          {settled.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Ainda não há caixas prestados.
            </Card>
          ) : (
            settled.map((r) => (
              <Link
                key={r.id}
                to="/entregas/caixa/$routeId"
                params={{ routeId: r.id }}
                className="block"
              >
                <Card className="p-3 opacity-80 transition-opacity hover:opacity-100">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: r.color ?? "#3b82f6" }}
                        />
                        <span className="truncate">Caixa · {r.zone}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.settlement?.status === "conferida"
                            ? "Conferido"
                            : "Envelope entregue"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDatePT(r.route_date)} · entregue {formatEUR(r.net_cash)}
                        {r.envelope_code ? ` · ${r.envelope_code}` : ""}
                      </div>

                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
