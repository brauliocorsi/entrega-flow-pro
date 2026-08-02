import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getRouteCash,
  addCashExpense,
  deleteCashExpense,
  submitSettlement,
  EXPENSE_CATEGORIES,
} from "@/lib/cash.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatEUR, formatDatePT } from "@/lib/format";
import { ArrowLeft, Wallet, Plus, Trash2, Camera, PackageCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregas/caixa/$routeId")({
  head: () => ({
    meta: [
      { title: "Caixa da rota — UP Agenda" },
      {
        name: "description",
        content: "Valor em mãos, despesas da rota e fecho de envelope para prestação de contas.",
      },
    ],
  }),
  component: CaixaRotaPage,
});

const STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  aprovada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejeitada: "bg-rose-100 text-rose-800 border-rose-200",
};

function CaixaRotaPage() {
  const { routeId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cashFn = useServerFn(getRouteCash);
  const addFn = useServerFn(addCashExpense);
  const delFn = useServerFn(deleteCashExpense);
  const submitFn = useServerFn(submitSettlement);

  const { data, isLoading } = useQuery({
    queryKey: ["route-cash", routeId],
    queryFn: () => cashFn({ data: { routeId } }),
  });

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [envOpen, setEnvOpen] = useState(false);
  const [declared, setDeclared] = useState("");
  const [envNotes, setEnvNotes] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["route-cash", routeId] });
    qc.invalidateQueries({ queryKey: ["my-day"] });
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const value = Number(amount.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) throw new Error("Valor inválido");
      if (description.trim().length < 3) throw new Error("Descreve a despesa");
      if (!file) throw new Error("A foto do recibo é obrigatória");

      setUploading(true);
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${uid}/${routeId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("recibos-caixa").upload(path, file);
      if (upErr) throw new Error(upErr.message);

      return addFn({
        data: {
          route_id: routeId,
          category,
          amount: value,
          description: description.trim(),
          receipt_path: path,
        },
      });
    },
    onSuccess: () => {
      toast.success("Despesa registada");
      setOpen(false);
      setAmount("");
      setDescription("");
      setFile(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao registar despesa"),
    onSettled: () => setUploading(false),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Despesa removida");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const value = Number(declared.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) throw new Error("Valor inválido");
      return submitFn({
        data: { route_id: routeId, cash_declared: value, notes: envNotes.trim() || undefined },
      });
    },
    onSuccess: (res: any) => {
      toast.success(`Envelope ${res.envelope_code} fechado — pendente de conferência`);
      setEnvOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao fechar envelope"),
  });

  if (isLoading || !data) return <div className="text-muted-foreground">A carregar…</div>;

  const settlement: any = data.settlement;
  const closed = !!settlement && settlement.status !== "aberta";

  return (
    <div className="space-y-4 pb-8 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/entregas" })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> O meu dia
      </Button>

      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Caixa da rota · {data.route.zone}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDatePT(data.route.route_date)}
              {settlement ? ` · ${settlement.envelope_code}` : ""}
            </p>
          </div>
          <Badge
            className={
              !settlement
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : settlement.status === "conferida"
                  ? "bg-sky-600 text-white border-sky-600"
                  : "bg-amber-500 text-white border-amber-500"
            }
          >
            {!settlement
              ? "Caixa aberto"
              : settlement.status === "conferida"
                ? "Conferido"
                : "Envelope entregue"}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-2">
            <div className="text-[11px] uppercase text-muted-foreground">Previsto</div>
            <div className="font-semibold tabular-nums">{formatEUR(data.forecast_total)}</div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-[11px] uppercase text-muted-foreground">Realizado</div>
            <div className="font-semibold tabular-nums text-emerald-600">
              {formatEUR(data.realized_total)}
            </div>
          </div>
          <div className="rounded-lg border p-2">
            <div className="text-[11px] uppercase text-muted-foreground">Diferença</div>
            <div className="font-semibold tabular-nums">
              {formatEUR(Number(data.realized_total) - Number(data.forecast_total))}
            </div>
          </div>
        </div>

        {data.is_settled ? (
          <div className="rounded-lg bg-muted p-4 text-center">
            <div className="text-xs uppercase text-muted-foreground">Em mãos (dinheiro)</div>
            <div className="text-3xl font-bold">{formatEUR(0)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Caixa desta rota finalizado com a entrega do envelope · entregue{" "}
              {formatEUR(data.net_cash)} ({formatEUR(data.cash_in)} recebido −{" "}
              {formatEUR(data.expenses_total)} saídas). O próximo caixa é o da próxima rota.
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
            <div className="text-xs uppercase text-muted-foreground">Em mãos (dinheiro)</div>
            <div className="text-3xl font-bold text-emerald-600">{formatEUR(data.in_hand)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatEUR(data.cash_in)} recebido − {formatEUR(data.expenses_total)} saídas · caixa
              aberto até entregares o envelope
            </div>
          </div>
        )}


        {data.other_methods.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs uppercase text-muted-foreground">
              Outros métodos (conciliação do admin)
            </div>
            {data.other_methods.map((m: any) => (
              <div
                key={m.method_name}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">{m.method_name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatEUR(m.amount)}</span>
                  <Badge
                    variant="outline"
                    className={
                      m.confirmed
                        ? "text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"
                        : "text-[10px]"
                    }
                  >
                    {m.confirmed ? "Confirmado" : "Aguarda conciliação"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Saídas de caixa</h2>
          {!closed && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Nova saída
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registar saída de caixa</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="amount">Valor (€)</Label>
                    <Input
                      id="amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="25,00"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="desc">Descrição</Label>
                    <Textarea
                      id="desc"
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Abastecimento na A4"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="receipt">Foto do recibo (obrigatória)</Label>
                    <Input
                      id="receipt"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="mt-1"
                    />
                    {file && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Camera className="h-3 w-3" /> {file.name}
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => addMut.mutate()}
                    disabled={addMut.isPending || uploading}
                  >
                    {(addMut.isPending || uploading) && (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    )}
                    Registar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {data.expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem saídas registadas.</p>
        ) : (
          <div className="divide-y">
            {data.expenses.map((e: any) => (
              <div key={e.id} className="py-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">
                    {e.category} · {formatEUR(Number(e.amount))}
                  </div>
                  <div className="text-xs text-muted-foreground">{e.description}</div>
                  <Badge className={`mt-1 text-[10px] ${STATUS_TONE[e.status]}`}>{e.status}</Badge>
                  {e.review_notes && (
                    <p className="text-[11px] text-muted-foreground mt-1">{e.review_notes}</p>
                  )}
                </div>
                {!closed && e.status === "pendente" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => delMut.mutate(e.id)}
                    aria-label="Remover despesa"
                  >
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Prestação de contas</h2>
        {settlement ? (
          <div className="space-y-1 text-sm">
            <div className="font-mono text-base font-bold">{settlement.envelope_code}</div>
            <div className="text-muted-foreground">
              Declarado: {formatEUR(Number(settlement.cash_declared))} · Esperado:{" "}
              {formatEUR(Number(settlement.cash_expected))}
            </div>
            <Badge
              className={
                settlement.status === "conferida"
                  ? "bg-sky-100 text-sky-800 border-sky-200"
                  : "bg-amber-100 text-amber-800 border-amber-200"
              }
            >
              {settlement.status === "conferida"
                ? "Conferida pelo admin"
                : "Pendente de conferência"}
            </Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Fecha o envelope no fim do dia com o valor em dinheiro que vais depositar.
          </p>
        )}

        {!closed && (
          <Dialog open={envOpen} onOpenChange={setEnvOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" onClick={() => setDeclared(String(data.net_cash))}>
                <PackageCheck className="h-4 w-4 mr-1" /> Fechar envelope
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Fechar envelope</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Recebido em dinheiro</span>
                    <span className="font-semibold">{formatEUR(data.cash_in)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Despesas</span>
                    <span className="font-semibold">− {formatEUR(data.expenses_total)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span>A depositar</span>
                    <span className="font-bold text-emerald-600">{formatEUR(data.net_cash)}</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="declared">Valor colocado no envelope (€)</Label>
                  <Input
                    id="declared"
                    inputMode="decimal"
                    value={declared}
                    onChange={(e) => setDeclared(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="envnotes">Observações</Label>
                  <Textarea
                    id="envnotes"
                    rows={2}
                    value={envNotes}
                    onChange={(e) => setEnvNotes(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
                  {submitMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Confirmar envelope
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </Card>
    </div>
  );
}
