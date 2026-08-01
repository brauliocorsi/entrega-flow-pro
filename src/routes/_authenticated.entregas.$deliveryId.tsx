import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getCourierDelivery,
  addDeliveryPayment,
  deleteDeliveryPayment,
  setDeliveryResult,
  openServiceRequest,
} from "@/lib/courier.functions";
import { listPaymentMethods } from "@/lib/payment-methods.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatEUR, formatDateTimePT } from "@/lib/format";
import { computeDeliveryTotals } from "@/lib/delivery-totals";
import { DELIVERY_TYPE_LABEL } from "@/lib/constants";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Trash2,
  Wrench,
  CheckCircle2,
  XCircle,
  CalendarClock,
  Ban,
  PackageCheck,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregas/$deliveryId")({
  head: () => ({
    meta: [
      { title: "Entrega — UP Agenda" },
      { name: "description", content: "Confirmar entrega, registar recebimentos e assistências." },
    ],
  }),
  component: CourierDeliveryPage,
});

function productList(payload: any): string[] {
  const p = payload ?? {};
  const arr =
    p.produtos ?? p.items ?? p.produto ?? p.itens ?? p.linhas ?? p.produtos_servicos ?? [];
  const list = Array.isArray(arr) ? arr : [arr];
  return list
    .map((it: any) =>
      String(
        it?.nome_produto ?? it?.produto?.nome ?? it?.nome ?? it?.descricao ?? it?.name ?? "",
      ).trim(),
    )
    .filter(Boolean);
}

function CourierDeliveryPage() {
  const { deliveryId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const load = useServerFn(getCourierDelivery);
  const methodsFn = useServerFn(listPaymentMethods);

  const { data, isLoading } = useQuery({
    queryKey: ["courier-delivery", deliveryId],
    queryFn: () => load({ data: { deliveryId } }),
  });
  const { data: methods } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => methodsFn(),
  });

  useEffect(() => {
    const channel = supabase
      .channel(`delivery-${deliveryId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_payments" }, () =>
        qc.invalidateQueries({ queryKey: ["courier-delivery", deliveryId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_deliveries" }, () =>
        qc.invalidateQueries({ queryKey: ["courier-delivery", deliveryId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deliveryId, qc]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["courier-delivery", deliveryId] });
    qc.invalidateQueries({ queryKey: ["my-day"] });
  };

  const payFn = useServerFn(addDeliveryPayment);
  const delPayFn = useServerFn(deleteDeliveryPayment);
  const resultFn = useServerFn(setDeliveryResult);
  const assistFn = useServerFn(openServiceRequest);

  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [resultNotes, setResultNotes] = useState("");

  const [assistOpen, setAssistOpen] = useState(false);
  const [product, setProduct] = useState("");
  const [defect, setDefect] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const addPay = useMutation({
    mutationFn: () =>
      payFn({
        data: {
          delivery_id: deliveryId,
          method_id: methodId,
          amount: Number(amount.replace(",", ".")),
          notes: payNotes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Recebimento registado");
      setAmount("");
      setPayNotes("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removePay = useMutation({
    mutationFn: (id: string) => delPayFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Recebimento removido");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const finish = useMutation({
    mutationFn: (result: "entregue" | "parcial" | "nao_entregue" | "cancelado" | "reagendado") =>
      resultFn({ data: { delivery_id: deliveryId, result, notes: resultNotes || null } }),
    onSuccess: (res: any) => {
      toast.success(res?.queued ? "Enviado para a fila de reagendamento" : "Entrega confirmada");
      invalidate();
      navigate({ to: "/entregas" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAssist = useMutation({
    mutationFn: () =>
      assistFn({
        data: {
          delivery_id: deliveryId,
          product_name: product,
          description: defect,
          photos,
        },
      }),
    onSuccess: () => {
      toast.success("Assistência aberta");
      setAssistOpen(false);
      setProduct("");
      setDefect("");
      setPhotos([]);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function uploadPhoto(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("assistencias").upload(path, file);
      if (error) throw error;
      setPhotos((p) => [...p, path]);
      toast.success("Foto anexada");
    } catch (e: any) {
      toast.error(e.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  if (isLoading || !data) return <div className="text-muted-foreground">A carregar…</div>;

  const d: any = data.delivery;
  const paid = data.payments.reduce((a: number, p: any) => a + Number(p.amount), 0);
  const totals = computeDeliveryTotals(d);
  const remaining = totals.remainingValue;
  const produtos = productList(d.order_payload);


  return (
    <div className="space-y-4 pb-8">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/entregas" })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> O meu dia
      </Button>

      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">
              #{d.order_number} · {d.customer_name}
            </h1>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {[d.address, d.zip_code, d.city].filter(Boolean).join(", ")}
            </div>
          </div>
          <Badge variant="outline">
            {DELIVERY_TYPE_LABEL[d.delivery_type] ?? d.delivery_type}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.phone && (
            <Button asChild size="sm" variant="secondary">
              <a href={`tel:${d.phone}`}>
                <Phone className="h-4 w-4 mr-1" /> Ligar
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant="secondary">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                [d.address, d.zip_code, d.city].filter(Boolean).join(", "),
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin className="h-4 w-4 mr-1" /> Navegar
            </a>
          </Button>
        </div>
        {d.notes && <p className="text-sm bg-muted rounded-md p-2">{d.notes}</p>}
      </Card>

      <Card className="p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Total</div>
            <div className="font-semibold">{formatEUR(Number(d.total_value ?? 0))}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">Já pago</div>
            <div className="font-semibold text-emerald-600">
              {formatEUR(Number(d.paid_value ?? 0))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">A receber</div>
            <div className="font-semibold text-amber-600">{formatEUR(remaining)}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Recebimentos ({formatEUR(paid)} hoje)</h2>
        {data.payments.length > 0 && (
          <div className="space-y-2">
            {data.payments.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {formatEUR(Number(p.amount))} · {p.method_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {formatDateTimePT(p.created_at)} · {p.received_by_name ?? "—"}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removePay.mutate(p.id)}
                  aria-label="Remover recebimento"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label className="text-xs">Valor</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Forma</Label>
            <Select value={methodId} onValueChange={setMethodId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher" />
              </SelectTrigger>
              <SelectContent>
                {(methods ?? [])
                  .filter((m: any) => m.active)
                  .map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!amount || !methodId || addPay.isPending}
              onClick={() => addPay.mutate()}
            >
              Registar
            </Button>
          </div>
        </div>
        <Input
          placeholder="Nota (opcional)"
          value={payNotes}
          onChange={(e) => setPayNotes(e.target.value)}
        />
        {remaining > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAmount(String(remaining).replace(".", ","))}
          >
            Preencher em falta ({formatEUR(remaining)})
          </Button>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Assistências</h2>
          <Dialog open={assistOpen} onOpenChange={setAssistOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Wrench className="h-4 w-4 mr-1" /> Abrir
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Abrir assistência</DialogTitle>
                <DialogDescription>
                  Produto com defeito nesta encomenda. Fica em fila para a equipa interna.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Produto</Label>
                  {produtos.length > 0 ? (
                    <Select value={product} onValueChange={setProduct}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolher produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map((p, i) => (
                          <SelectItem key={`${p}-${i}`} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={product}
                      onChange={(e) => setProduct(e.target.value)}
                      placeholder="Nome do produto"
                    />
                  )}
                </div>
                <div>
                  <Label className="text-xs">Descrição do defeito</Label>
                  <Textarea value={defect} onChange={(e) => setDefect(e.target.value)} rows={3} />
                </div>
                <div>
                  <Label className="text-xs">Fotos</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadPhoto(f);
                      e.target.value = "";
                    }}
                  />
                  {uploading && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> A enviar…
                    </p>
                  )}
                  {photos.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {photos.length} foto(s) anexada(s)
                    </p>
                  )}
                </div>
                <Button
                  className="w-full"
                  disabled={!product || defect.trim().length < 3 || openAssist.isPending}
                  onClick={() => openAssist.mutate()}
                >
                  Abrir assistência
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {data.services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem assistências nesta entrega.</p>
        ) : (
          data.services.map((s: any) => (
            <div key={s.id} className="rounded-md border px-3 py-2">
              <div className="text-sm font-medium">{s.product_name}</div>
              <div className="text-xs text-muted-foreground">{s.description}</div>
              <Badge variant="secondary" className="mt-1 text-[10px]">
                {s.status}
              </Badge>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Resultado da entrega</h2>
        {d.outcome && (
          <Badge className="bg-sky-100 text-sky-800 border-sky-200">
            Já registado: {d.outcome} · {formatDateTimePT(d.outcome_at)}
          </Badge>
        )}
        <Textarea
          placeholder="Observações (opcional)"
          rows={2}
          value={resultNotes}
          onChange={(e) => setResultNotes(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={finish.isPending}
            onClick={() => finish.mutate("entregue")}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Entregue
          </Button>
          <Button
            variant="secondary"
            disabled={finish.isPending}
            onClick={() => finish.mutate("parcial")}
          >
            <PackageCheck className="h-4 w-4 mr-1" /> Parcial
          </Button>
          <Button
            variant="outline"
            disabled={finish.isPending}
            onClick={() => finish.mutate("nao_entregue")}
          >
            <XCircle className="h-4 w-4 mr-1" /> Não entregue
          </Button>
          <Button
            variant="outline"
            disabled={finish.isPending}
            onClick={() => finish.mutate("reagendado")}
          >
            <CalendarClock className="h-4 w-4 mr-1" /> Reagendar
          </Button>
          <Button
            variant="destructive"
            className="col-span-2"
            disabled={finish.isPending}
            onClick={() => finish.mutate("cancelado")}
          >
            <Ban className="h-4 w-4 mr-1" /> Cancelar entrega
          </Button>
        </div>
      </Card>
    </div>
  );
}
