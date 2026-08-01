import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getReconciliation,
  uploadStatement,
  applyMatch,
  unmatch,
  ignoreTransaction,
  deleteStatement,
} from "@/lib/reconciliation.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEUR, formatDatePT } from "@/lib/format";
import {
  Upload,
  Link2,
  Link2Off,
  EyeOff,
  Eye,
  Trash2,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
} from "lucide-react";

const CONFIDENCE_TONE: Record<string, string> = {
  alta: "bg-emerald-100 text-emerald-800 border-emerald-200",
  media: "bg-amber-100 text-amber-800 border-amber-200",
  baixa: "bg-muted text-muted-foreground border-border",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function ConciliacaoPanel() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => today());
  const [txFilter, setTxFilter] = useState<"por_conciliar" | "conciliado" | "todos">("por_conciliar");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFn = useServerFn(getReconciliation);
  const uploadFn = useServerFn(uploadStatement);
  const matchFn = useServerFn(applyMatch);
  const unmatchFn = useServerFn(unmatch);
  const ignoreFn = useServerFn(ignoreTransaction);
  const deleteFn = useServerFn(deleteStatement);

  const { data, isLoading } = useQuery({
    queryKey: ["reconciliation", from, to],
    queryFn: () => loadFn({ data: { scope: "periodo" as const, from, to } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["reconciliation"] });
    qc.invalidateQueries({ queryKey: ["settlements"] });
  };

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      return uploadFn({
        data: {
          file_name: file.name,
          mime: file.type || "application/octet-stream",
          base64,
          scope: "periodo" as const,
          period_start: from,
          period_end: to,
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(`${r.count} movimento(s) importado(s) — revê e confirma cada correspondência`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao ler o documento"),
  });

  const matchMut = useMutation({
    mutationFn: (v: { transaction_id: string; payment_id: string }) => matchFn({ data: v }),
    onSuccess: () => {
      toast.success("Movimento conciliado e recebimento confirmado");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const unmatchMut = useMutation({
    mutationFn: (id: string) => unmatchFn({ data: { transaction_id: id } }),
    onSuccess: () => {
      toast.success("Conciliação desfeita");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const ignoreMut = useMutation({
    mutationFn: (v: { transaction_id: string; ignored: boolean }) => ignoreFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Extrato removido");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const transactions = useMemo(() => {
    const all = (data?.transactions ?? []) as any[];
    if (txFilter === "todos") return all;
    return all.filter((t) => t.status === txFilter);
  }, [data, txFilter]);

  const payments = (data?.payments ?? []) as any[];
  const pendingPayments = payments.filter((p) => !p.reconciled_at);
  const totals = data?.totals;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Conciliação MB Way · Multibanco · Transferências
          </h2>
          <div className="flex items-center gap-2">
            <Input type="date" className="w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-muted-foreground text-sm">→</span>
            <Input type="date" className="w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,.xls,.xlsx,application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadMut.mutate(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploadMut.isPending}>
            {uploadMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Carregar extrato
          </Button>
          <p className="text-xs text-muted-foreground">
            CSV/Excel do banco (leitura direta) ou PDF/fotografia (leitura por IA). Nada é conciliado
            automaticamente — cada linha exige confirmação humana.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Metric label="Total extrato" value={formatEUR(totals?.statement_total ?? 0)} />
          <Metric label="Conciliado" value={formatEUR(totals?.matched_total ?? 0)} tone="text-emerald-600" />
          <Metric label="Movimentos por ligar" value={String(totals?.unmatched ?? 0)} tone="text-amber-600" />
          <Metric label="Recebimentos por conciliar" value={String(totals?.payments_pending ?? 0)} />
        </div>
      </Card>

      {(data?.statements ?? []).length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-[11px] uppercase text-muted-foreground">Extratos carregados</div>
          {(data?.statements ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{s.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.kind} · {s.transactions_count} movimento(s)
                  {s.uploaded_by_name ? ` · ${s.uploaded_by_name}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-rose-600"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate(s.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["por_conciliar", "Por conciliar"],
            ["conciliado", "Conciliados"],
            ["todos", "Todos"],
          ] as const
        ).map(([f, label]) => (
          <Button
            key={f}
            size="sm"
            variant={txFilter === f ? "secondary" : "outline"}
            className="h-7"
            onClick={() => setTxFilter(f)}
          >
            {label}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{transactions.length} movimento(s)</span>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">A carregar…</Card>
      ) : transactions.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem movimentos nesta seleção. Carrega um extrato para começar.
        </Card>
      ) : (
        transactions.map((t: any) => (
          <TransactionRow
            key={t.id}
            tx={t}
            payments={pendingPayments}
            onMatch={(payment_id) => matchMut.mutate({ transaction_id: t.id, payment_id })}
            onUnmatch={() => unmatchMut.mutate(t.id)}
            onIgnore={(ignored) => ignoreMut.mutate({ transaction_id: t.id, ignored })}
            busy={matchMut.isPending || unmatchMut.isPending}
          />
        ))
      )}

      <Card className="p-4 space-y-2">
        <div className="text-[11px] uppercase text-muted-foreground">
          Recebimentos por conciliar ({pendingPayments.length})
        </div>
        {pendingPayments.length === 0 ? (
          <div className="text-sm text-muted-foreground">Tudo conciliado neste período.</div>
        ) : (
          pendingPayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">
                #{p.order_number} · {p.customer_name}
                <span className="text-muted-foreground"> · {p.method_name}</span>
              </span>
              <span className="font-semibold shrink-0">{formatEUR(p.amount)}</span>
            </div>
          ))
        )}
      </Card>
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

function TransactionRow({
  tx,
  payments,
  onMatch,
  onUnmatch,
  onIgnore,
  busy,
}: {
  tx: any;
  payments: any[];
  onMatch: (paymentId: string) => void;
  onUnmatch: () => void;
  onIgnore: (ignored: boolean) => void;
  busy: boolean;
}) {
  const [manual, setManual] = useState<string>("");
  const conciliado = tx.status === "conciliado";
  const ignorado = tx.status === "ignorado";

  return (
    <Card className={`p-4 space-y-2 ${conciliado ? "border-emerald-200 bg-emerald-50/40" : ""}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium">
            {formatEUR(tx.amount)}
            <span className="text-muted-foreground font-normal">
              {tx.tx_date ? ` · ${formatDatePT(tx.tx_date)}` : ""}
            </span>
          </div>
          <div className="text-xs text-muted-foreground break-words">{tx.description}</div>
          {tx.reference && <div className="text-[11px] text-muted-foreground">Ref: {tx.reference}</div>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {tx.method && <Badge variant="outline" className="text-[10px]">{tx.method}</Badge>}
          <Badge
            className={
              conciliado
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : ignorado
                  ? "bg-muted text-muted-foreground border-border"
                  : "bg-amber-100 text-amber-800 border-amber-200"
            }
          >
            {conciliado ? "Conciliado" : ignorado ? "Ignorado" : "Por conciliar"}
          </Badge>
        </div>
      </div>

      {conciliado && tx.matched_payment && (
        <div className="rounded-md border bg-background px-3 py-2 text-xs flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            #{tx.matched_payment.order_number} · {tx.matched_payment.customer_name} ·{" "}
            {tx.matched_payment.method_name}
          </span>
          <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={onUnmatch}>
            <Link2Off className="h-3.5 w-3.5 mr-1" /> Desfazer
          </Button>
        </div>
      )}

      {!conciliado && (
        <>
          {(tx.suggestions ?? []).length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase text-muted-foreground">
                Sugestões (requer confirmação)
              </div>
              {(tx.suggestions ?? []).map((s: any) => {
                const p = payments.find((x) => x.id === s.payment_id);
                if (!p) return null;
                return (
                  <div
                    key={s.payment_id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-xs flex-wrap"
                  >
                    <span className="min-w-0">
                      #{p.order_number} · {p.customer_name} · {p.method_name} ·{" "}
                      <strong>{formatEUR(p.amount)}</strong>
                      <span className="block text-[11px] text-muted-foreground">{s.reason}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Badge className={`text-[10px] ${CONFIDENCE_TONE[s.confidence]}`}>
                        {CONFIDENCE_LABEL[s.confidence]}
                      </Badge>
                      <Button
                        size="sm"
                        className="h-7"
                        disabled={busy}
                        onClick={() => onMatch(s.payment_id)}
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1" /> Conciliar
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={manual} onValueChange={setManual}>
              <SelectTrigger className="h-8 flex-1 min-w-[220px] text-xs">
                <SelectValue placeholder="Ligar manualmente a um recebimento…" />
              </SelectTrigger>
              <SelectContent>
                {payments.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    #{p.order_number} · {p.customer_name} · {p.method_name} · {formatEUR(p.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!manual || busy}
              onClick={() => manual && onMatch(manual)}
            >
              <Link2 className="h-3.5 w-3.5 mr-1" /> Ligar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => onIgnore(!ignorado)}
            >
              {ignorado ? (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Repor
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5 mr-1" /> Ignorar
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
