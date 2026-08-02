import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getConferredHistory } from "@/lib/cash.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatEUR, formatDatePT, formatDateTimePT } from "@/lib/format";
import { History, Search, CheckCircle2 } from "lucide-react";

/** Histórico permanente de envelopes já conferidos. */
export function HistoricoEnvelopes() {
  const fn = useServerFn(getConferredHistory);
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["conferred-history"],
    queryFn: () => fn({ data: { limit: 200 } }),
  });

  const rows = useMemo(() => {
    const list = (data?.settlements ?? []) as any[];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((s) =>
      [
        s.envelope_code,
        s.route?.zone,
        s.route?.driver,
        s.route?.assistant,
        s.reviewed_by_name,
        s.submitted_by_name,
        s.route?.route_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data, q]);

  const total = rows.reduce((a, s: any) => a + Number(s.cash_declared ?? 0), 0);

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold flex items-center gap-2">
            <History className="h-5 w-5" /> Envelopes conferidos
          </h2>
          <span className="text-xs text-muted-foreground">
            {rows.length} envelope(s) · {formatEUR(total)} declarados
          </span>
        </div>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Pesquisar por envelope, rota, data ou responsável…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">A carregar…</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ainda não há envelopes conferidos.
        </Card>
      ) : (
        rows.map((s: any) => {
          const diff = Number(s.cash_diff ?? 0);
          return (
            <Card key={s.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono font-bold text-sm">{s.envelope_code}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.route?.zone ?? "Rota"} ·{" "}
                    {s.route?.route_date ? formatDatePT(s.route.route_date) : "—"}
                    {s.route?.driver ? ` · ${s.route.driver}` : ""}
                  </div>
                </div>
                <Badge className="bg-sky-100 text-sky-800 border-sky-200 shrink-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Conferido
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="Declarado" value={formatEUR(Number(s.cash_declared))} />
                <Metric label="Esperado" value={formatEUR(Number(s.cash_expected))} />
                <Metric
                  label="Diferença"
                  value={formatEUR(diff)}
                  tone={Math.abs(diff) < 0.01 ? "text-muted-foreground" : "text-amber-600"}
                />
              </div>

              {Array.isArray(s.methods) && s.methods.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.methods.map((m: any) => (
                    <Badge key={m.method_name} variant="outline" className="text-[10px]">
                      {m.method_name}: {formatEUR(Number(m.amount ?? 0))}
                      {m.confirmed ? " ✓" : ""}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="text-[11px] text-muted-foreground">
                Entregue por {s.submitted_by_name ?? "—"}
                {s.submitted_at ? ` · ${formatDateTimePT(s.submitted_at)}` : ""} · Conferido por{" "}
                {s.reviewed_by_name ?? "—"}
                {s.reviewed_at ? ` · ${formatDateTimePT(s.reviewed_at)}` : ""}
              </div>
              {s.notes && <div className="text-xs">{s.notes}</div>}
            </Card>
          );
        })
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
