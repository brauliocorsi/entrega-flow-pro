import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  extractInvoiceFromImage,
  saveExtractionDraft,
  createPurchaseInGestaoClick,
  type ExtractedInvoice,
} from "@/lib/purchases.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
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
import { formatEUR } from "@/lib/format";
import { Camera, Upload, Loader2, Sparkles, Trash2, Plus, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/compras/nova")({
  component: NovaCompraPage,
});

const HIGH_CONFIDENCE = 0.9;

type ReviewItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  vat_rate: number | null;
  confidence: number;
};

type ReviewState = {
  supplier_name: string;
  supplier_document: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total: number;
  items: ReviewItem[];
  overall_confidence: number;
  notes: string;
};

function toReview(e: ExtractedInvoice): ReviewState {
  return {
    supplier_name: e.supplier_name ?? "",
    supplier_document: e.supplier_document ?? "",
    invoice_number: e.invoice_number ?? "",
    invoice_date: e.invoice_date ?? "",
    due_date: e.due_date ?? "",
    total: Number(e.total ?? 0),
    items: (e.items ?? []).map((i) => ({
      description: i.description ?? "",
      quantity: Number(i.quantity ?? 0),
      unit_price: Number(i.unit_price ?? 0),
      total: Number(i.total ?? 0),
      vat_rate: i.vat_rate ?? null,
      confidence: Number(i.confidence ?? 0),
    })),
    overall_confidence: Number(e.overall_confidence ?? 0),
    notes: e.notes ?? "",
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function NovaCompraPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const extractFn = useServerFn(extractInvoiceFromImage);
  const saveDraftFn = useServerFn(saveExtractionDraft);
  const createFn = useServerFn(createPurchaseInGestaoClick);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [financeMode, setFinanceMode] = useState<"paga" | "em_aberto">("em_aberto");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("transferencia");

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ficheiro maior que 10MB");
      return;
    }
    setExtracting(true);
    try {
      const base64 = await fileToBase64(file);

      let imagePath: string | null = null;
      if (user?.id) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("invoice-scans")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (!upErr) imagePath = path;
      }

      const res = await extractFn({
        data: { fileBase64: base64, mimeType: file.type || "image/jpeg" },
      });
      if (res.error || !res.extracted) {
        toast.error(res.error ?? "Falha ao ler fatura");
        return;
      }

      const rev = toReview(res.extracted);
      setReview(rev);
      if (!rev.due_date) setFinanceMode("em_aberto");

      const draft = await saveDraftFn({
        data: { imagePath, extracted: res.extracted },
      });
      setDraftId(draft.id);

      if (rev.overall_confidence >= HIGH_CONFIDENCE) {
        toast.success("Fatura lida com alta confiança. Confirma e envia.");
      } else {
        toast.warning("Confiança baixa nalguns campos — revê antes de enviar.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar imagem");
    } finally {
      setExtracting(false);
    }
  }

  function updateItem(idx: number, patch: Partial<ReviewItem>) {
    if (!review) return;
    const items = review.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setReview({ ...review, items });
  }

  function addItem() {
    if (!review) return;
    setReview({
      ...review,
      items: [
        ...review.items,
        { description: "", quantity: 1, unit_price: 0, total: 0, vat_rate: 23, confidence: 1 },
      ],
    });
  }

  function removeItem(idx: number) {
    if (!review) return;
    setReview({ ...review, items: review.items.filter((_, i) => i !== idx) });
  }

  async function handleSubmit() {
    if (!review) return;
    if (!review.supplier_name.trim() || !review.invoice_number.trim() || !review.invoice_date) {
      toast.error("Preenche fornecedor, nº fatura e data");
      return;
    }
    if (review.items.length === 0) {
      toast.error("Adiciona pelo menos um item");
      return;
    }
    if (financeMode === "paga" && !paymentDate) {
      toast.error("Indica a data de pagamento");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createFn({
        data: {
          importedPurchaseId: draftId,
          supplier_name: review.supplier_name.trim(),
          supplier_document: review.supplier_document.trim() || null,
          invoice_number: review.invoice_number.trim(),
          invoice_date: review.invoice_date,
          due_date: review.due_date || null,
          total: Number(review.total),
          items: review.items.map((it) => ({
            description: it.description.trim(),
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
            total: Number(it.total),
            vat_rate: it.vat_rate,
          })),
          finance: {
            mode: financeMode,
            payment_date: financeMode === "paga" ? paymentDate : null,
            payment_method: financeMode === "paga" ? paymentMethod : null,
          },
          notes: review.notes || null,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "Falha ao enviar para GestãoClick");
        return;
      }
      if (res.warning) {
        toast.warning(`Compra criada, mas: ${res.warning}`);
      } else {
        toast.success(`Compra criada no GestãoClick (#${res.compraId})`);
      }
      navigate({ to: "/compras" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  const lowConfidence = review && review.overall_confidence < HIGH_CONFIDENCE;

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Nova compra por foto</h1>
        <p className="text-sm text-muted-foreground">
          Tira foto ou faz upload da fatura. A IA preenche e tu confirmas.
        </p>
      </div>

      {!review && (
        <Card className="p-8 text-center space-y-4">
          {extracting ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
              <div>A ler fatura…</div>
            </>
          ) : (
            <>
              <Sparkles className="h-10 w-10 mx-auto text-primary" />
              <div className="text-sm text-muted-foreground">
                JPG, PNG ou PDF (até 10MB). No telemóvel abre a câmara.
              </div>
              <div className="flex justify-center gap-2">
                <Button
                  onClick={() => {
                    if (fileRef.current) {
                      fileRef.current.removeAttribute("capture");
                      fileRef.current.click();
                    }
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" /> Upload
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (fileRef.current) {
                      fileRef.current.setAttribute("capture", "environment");
                      fileRef.current.click();
                    }
                  }}
                >
                  <Camera className="h-4 w-4 mr-2" /> Câmara
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </Card>
      )}

      {review && (
        <>
          {lowConfidence && (
            <Card className="p-3 border-yellow-500/40 bg-yellow-500/5 flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Confiança da IA: {(review.overall_confidence * 100).toFixed(0)}% — revê os campos antes de enviar.
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Fornecedor</Label>
                <Input
                  value={review.supplier_name}
                  onChange={(e) => setReview({ ...review, supplier_name: e.target.value })}
                />
              </div>
              <div>
                <Label>NIF</Label>
                <Input
                  value={review.supplier_document}
                  onChange={(e) => setReview({ ...review, supplier_document: e.target.value })}
                />
              </div>
              <div>
                <Label>Nº fatura</Label>
                <Input
                  value={review.invoice_number}
                  onChange={(e) => setReview({ ...review, invoice_number: e.target.value })}
                />
              </div>
              <div>
                <Label>Data da fatura</Label>
                <Input
                  type="date"
                  value={review.invoice_date}
                  onChange={(e) => setReview({ ...review, invoice_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={review.due_date}
                  onChange={(e) => setReview({ ...review, due_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Total (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={review.total}
                  onChange={(e) => setReview({ ...review, total: Number(e.target.value) })}
                />
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Itens</h2>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {review.items.map((it, idx) => {
                const low = it.confidence < HIGH_CONFIDENCE;
                return (
                  <div
                    key={idx}
                    className={`grid grid-cols-12 gap-2 items-end p-2 rounded-md ${
                      low ? "bg-yellow-500/5 border border-yellow-500/30" : ""
                    }`}
                  >
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs">Descrição</Label>
                      <Input
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <Label className="text-xs">Qtd</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Label className="text-xs">Preço</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Label className="text-xs">Total</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={it.total}
                        onChange={(e) => updateItem(idx, { total: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <Label className="text-xs">IVA %</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={it.vat_rate ?? ""}
                        onChange={(e) =>
                          updateItem(idx, {
                            vat_rate: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1 flex justify-end">
                      <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              Soma linhas: {formatEUR(review.items.reduce((s, i) => s + Number(i.total || 0), 0))}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h2 className="font-semibold">Lançamento financeiro</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={financeMode} onValueChange={(v) => setFinanceMode(v as "paga" | "em_aberto")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="em_aberto">Conta a pagar (em aberto)</SelectItem>
                    <SelectItem value="paga">Já paga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {financeMode === "paga" && (
                <>
                  <div>
                    <Label>Data pagamento</Label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Método</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="multibanco">Multibanco</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="cartao">Cartão</SelectItem>
                        <SelectItem value="mbway">MB Way</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                rows={2}
                value={review.notes}
                onChange={(e) => setReview({ ...review, notes: e.target.value })}
              />
            </div>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/compras" })}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> A enviar…
                </>
              ) : (
                "Confirmar e enviar ao GestãoClick"
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
