import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { analyzeWeek, applySuggestion } from "@/lib/optimization.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, ArrowRight, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/otimizacao")({
  head: () => ({ meta: [{ title: "Otimização semanal — UP Agenda" }] }),
  component: OptPage,
});

function isoWeekRange(d = new Date()) {
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

function OptPage() {
  const { role, loading } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(analyzeWeek);
  const applyFn = useServerFn(applySuggestion);
  const init = isoWeekRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const enabled = !loading && (role === "admin" || role === "logistico");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["optimization", from, to],
    queryFn: () => fn({ data: { from, to } }),
    enabled,
  });

  if (!loading && role !== "admin" && role !== "logistico") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sem permissões</CardTitle>
          <CardDescription>Apenas administradores ou logística podem aceder.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function apply(delivery_id: string, to_route_id: string) {
    try {
      await applyFn({ data: { delivery_id, to_route_id } });
      toast.success("Entrega movida");
      qc.invalidateQueries();
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  const suggestions = data?.suggestions ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-amber-500" /> Otimização semanal</h1>
        <p className="text-sm text-muted-foreground">Sugestões automáticas de reagrupamento por proximidade de código postal.</p>
      </div>

      <Card className="p-3">
        <div className="grid sm:grid-cols-3 gap-2 items-end">
          <div className="space-y-1.5"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button onClick={() => refetch()} disabled={isFetching}>{isFetching ? "A analisar…" : "Analisar"}</Button>
        </div>
      </Card>

      {isFetching ? (
        <p className="text-sm text-muted-foreground">A analisar rotas…</p>
      ) : suggestions.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Sparkles className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
          Nenhuma sugestão. As rotas desta semana já estão bem agrupadas.
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{suggestions.length} sugestão(ões) encontradas:</p>
          {suggestions.map((s: any) => (
            <Card key={s.delivery_id} className="p-4">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <div className="font-semibold">#{s.order_number} — {s.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{s.city ?? "—"} · CP {s.zip_code ?? "—"}</div>
                  <div className="mt-2 text-sm flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{s.from_route_label}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{s.to_route_label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{s.reason}</p>
                  {!s.capacity_ok && (
                    <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Rota de destino sem capacidade suficiente
                    </p>
                  )}
                </div>
                <Button size="sm" onClick={() => apply(s.delivery_id, s.to_route_id)} disabled={!s.capacity_ok}>
                  Aplicar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
