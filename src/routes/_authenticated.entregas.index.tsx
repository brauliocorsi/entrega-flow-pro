import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyDay } from "@/lib/courier.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatEUR, formatDatePT } from "@/lib/format";
import { computeDeliveryTotals } from "@/lib/delivery-totals";
import { deliveryOutcomeTone, openNavigation } from "@/lib/nav-link";
import { DELIVERY_TYPE_LABEL } from "@/lib/constants";
import {
  Truck,
  MapPin,
  Phone,
  ChevronRight,
  CheckCircle2,
  CircleDashed,
  XCircle,
  Navigation,
  Wallet,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/entregas/")({
  head: () => ({
    meta: [
      { title: "O meu dia — UP Agenda" },
      { name: "description", content: "Rota do dia, recebimentos e confirmação de entregas." },
    ],
  }),
  component: MyDayPage,
});

function MyDayPage() {
  const qc = useQueryClient();
  const fn = useServerFn(getMyDay);
  const { data, isLoading } = useQuery({
    queryKey: ["my-day"],
    queryFn: () => fn({ data: {} }),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("my-day")
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_deliveries" }, () =>
        qc.invalidateQueries({ queryKey: ["my-day"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_payments" }, () =>
        qc.invalidateQueries({ queryKey: ["my-day"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  if (isLoading) return <div className="text-muted-foreground">A carregar…</div>;

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-6 w-6" /> O meu dia
        </h1>
        <p className="text-sm text-muted-foreground">
          {data ? formatDatePT(data.date) : ""}
        </p>
      </div>

      <CourierSummary
        pendingDeliveries={(data?.routes ?? []).reduce(
          (a: number, r: any) =>
            a +
            r.deliveries.filter((d: any) => d.status !== "cancelado" && !d.outcome).length,
          0,
        )}
      />




      {!data || data.routes.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <p className="font-medium">Sem rotas atribuídas para hoje.</p>
          <p className="text-sm text-muted-foreground">
            {data && !data.hasStaffProfile
              ? "A tua conta ainda não está associada a uma ficha de equipa. Fala com o administrador."
              : "Quando fores escalado numa rota de hoje, ela aparece aqui."}
          </p>
        </Card>
      ) : (
        data.routes.map((r: any) => {
          const active = r.deliveries.filter((d: any) => d.status !== "cancelado");
          const done = active.filter((d: any) => d.status === "entregue" || d.outcome);
          const forecast = active.reduce(
            (a: number, d: any) => a + computeDeliveryTotals(d).totalValue,
            0,
          );
          const received = r.payments.reduce((a: number, p: any) => a + Number(p.amount), 0);
          const pending = active.reduce(
            (a: number, d: any) => a + computeDeliveryTotals(d).remainingValue,
            0,
          );
          const cashInHand = r.payments
            .filter((p: any) => String(p.method_name ?? "").toLowerCase().includes("dinheiro"))
            .reduce((a: number, p: any) => a + Number(p.amount), 0);
          const pct = active.length ? (done.length / active.length) * 100 : 0;


          return (
            <Card key={r.id} className="overflow-hidden">
              <div
                className="px-4 py-3 border-b"
                style={{ borderLeft: `6px solid ${r.color ?? "#3b82f6"}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.zone}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[r.driver, r.assistant, r.vehicle].filter(Boolean).join(" · ") || "Sem frota"}
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {done.length}/{active.length}
                  </Badge>
                </div>
                <Progress value={pct} className="h-1.5 mt-3" />
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">Previsto</div>
                    <div className="font-semibold text-sm">{formatEUR(forecast)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">Recebido</div>
                    <div className="font-semibold text-sm text-emerald-600">
                      {formatEUR(received)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">Em falta</div>
                    <div className="font-semibold text-sm text-amber-600">{formatEUR(pending)}</div>
                  </div>
                </div>
                <Link
                  to="/entregas/caixa/$routeId"
                  params={{ routeId: r.id }}
                  className="mt-3 flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4" /> Caixa · em mãos
                  </span>
                  <span className="flex items-center gap-1 text-sm font-bold text-emerald-600">
                    {formatEUR(cashInHand)}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </Link>
              </div>


              <div className="divide-y">
                {r.deliveries.map((d: any) => {
                  const finished = !!d.outcome;
                  const tone = deliveryOutcomeTone(d.outcome, d.status);
                  const dTotals = computeDeliveryTotals(d);
                  const fullAddress = [d.address, d.zip_code, d.city]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <div key={d.id} className={`relative ${tone.card}`}>
                      <span
                        className={`absolute left-0 top-0 bottom-0 w-1 ${tone.bar}`}
                        aria-hidden
                      />
                      <Link
                        to="/entregas/$deliveryId"
                        params={{ deliveryId: d.id }}
                        className="flex items-start gap-3 pl-5 pr-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        {finished ? (
                          d.outcome === "nao_entregue" ? (
                            <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                          )
                        ) : (
                          <CircleDashed className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div
                              className={`font-medium truncate ${
                                finished && d.outcome !== "nao_entregue"
                                  ? "line-through decoration-emerald-600/50"
                                  : ""
                              }`}
                            >
                              #{d.order_number} · {d.customer_name}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {fullAddress}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <Badge className={`text-[10px] font-semibold ${tone.badge}`}>
                              {tone.label}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {DELIVERY_TYPE_LABEL[d.delivery_type] ?? d.delivery_type}
                            </Badge>
                            {dTotals.remainingValue > 0 ? (
                              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                                Receber {formatEUR(dTotals.remainingValue)}
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">
                                Liquidado
                              </Badge>
                            )}
                            {d.phone && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {d.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </Link>
                      {!finished && fullAddress && (
                        <div className="pl-5 pr-4 pb-3">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8"
                            onClick={() => openNavigation(fullAddress)}
                          >
                            <Navigation className="h-3.5 w-3.5 mr-1" /> Navegar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
