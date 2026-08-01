import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCashRoutes } from "@/lib/cash.functions";
import { useAuth } from "@/hooks/use-auth";
import { AdminEnvelopes } from "@/components/caixa/AdminEnvelopes";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEUR, formatDatePT, formatDateTimePT } from "@/lib/format";
import { PackageCheck, ChevronRight, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregas/envelopes")({
  head: () => ({
    meta: [
      { title: "Envelopes entregues — UP Agenda" },
      {
        name: "description",
        content: "Envelopes já entregues e o seu estado de conferência pelo administrador.",
      },
    ],
  }),
  component: EnvelopesPage,
});

function EnvelopesPage() {
  const { role } = useAuth();
  const isManager = role === "admin" || role === "logistico";
  const [picked, setScope] = useState<"meus" | "todos" | null>(null);
  const scope = picked ?? (isManager ? "todos" : "meus");

  return (
    <div className="space-y-4 pb-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <PackageCheck className="h-6 w-6" /> Envelopes
        </h1>
        <p className="text-sm text-muted-foreground">
          {isManager && scope === "todos"
            ? "Todos os envelopes com rota, data, responsáveis, saídas e previsto vs realizado."
            : "Envelopes entregues à espera de conferência e histórico já conferido."}
        </p>
      </div>

      {isManager && (
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={scope === "todos" ? "secondary" : "outline"}
            className="h-7"
            onClick={() => setScope("todos")}
          >
            Todas as rotas
          </Button>
          <Button
            size="sm"
            variant={scope === "meus" ? "secondary" : "outline"}
            className="h-7"
            onClick={() => setScope("meus")}
          >
            Os meus envelopes
          </Button>
        </div>
      )}

      {isManager && scope === "todos" ? <AdminEnvelopes /> : <MeusEnvelopes />}
    </div>
  );
}

function MeusEnvelopes() {
  const fn = useServerFn(getMyCashRoutes);
  const { data, isLoading } = useQuery({
    queryKey: ["my-cash-routes"],
    queryFn: () => fn({ data: { days: 90 } }),
    refetchOnWindowFocus: true,
  });

  if (isLoading) return <div className="text-muted-foreground">A carregar…</div>;


  const submitted = (data?.routes ?? []).filter(
    (r: any) => r.settlement && r.settlement.status !== "aberta",
  );
  const pending = submitted.filter((r: any) => r.settlement.status === "entregue");
  const done = submitted.filter((r: any) => r.settlement.status === "conferida");

  const totalPending = pending.reduce(
    (a: number, r: any) => a + Number(r.settlement.cash_declared),
    0,
  );

  return (
    <div className="space-y-4">


      <Card className="p-5 text-center">
        <div className="text-xs uppercase text-muted-foreground">
          Pendente de conferência
        </div>
        <div className="text-4xl font-bold text-amber-600">{formatEUR(totalPending)}</div>
        <div className="text-xs text-muted-foreground mt-1">{pending.length} envelope(s)</div>
      </Card>

      <Section
        title="Aguardam conferência"
        icon={<Clock className="h-4 w-4" />}
        rows={pending}
        empty="Sem envelopes por conferir."
      />
      <Section
        title="Conferidos"
        icon={<CheckCircle2 className="h-4 w-4" />}
        rows={done}
        empty="Ainda sem envelopes conferidos."
      />
    </div>
  );
}

function Section({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: any[];
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
        {icon} {title} ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{empty}</Card>
      ) : (
        rows.map((r: any) => {
          const st = r.settlement;
          const conferida = st.status === "conferida";
          const diff = Number(st.cash_declared) - Number(st.cash_expected);
          return (
            <Link
              key={r.id}
              to="/entregas/caixa/$routeId"
              params={{ routeId: r.id }}
              className="block"
            >
              <Card className="p-4 hover:bg-muted/50 transition-colors space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-sm">{st.envelope_code}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.zone} · {formatDatePT(r.route_date)}
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

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">Declarado</div>
                    <div className="font-semibold text-sm">
                      {formatEUR(Number(st.cash_declared))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">Esperado</div>
                    <div className="font-semibold text-sm">
                      {formatEUR(Number(st.cash_expected))}
                    </div>
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

                {r.other_methods.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.other_methods.map((m: any) => (
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

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Entregue {st.submitted_at ? formatDateTimePT(st.submitted_at) : "—"}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
