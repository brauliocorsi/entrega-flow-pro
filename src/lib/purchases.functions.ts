import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gcFetch, normalizeBaseUrl } from "@/lib/gestaoclick-core.server";

// ============ Shared DTOs ============

export interface ExtractedInvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  vat_rate: number | null;
  confidence: number; // 0..1
}

export interface ExtractedInvoice {
  supplier_name: string;
  supplier_document: string | null; // NIF
  invoice_number: string;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  items: ExtractedInvoiceItem[];
  overall_confidence: number; // 0..1
  notes: string | null;
}

// ============ GestãoClick helpers (purchases / suppliers / accounts payable) ============

function gcCreds() {
  const baseUrl = process.env.GESTAOCLICK_BASE_URL;
  const apiKey = process.env.GESTAOCLICK_API_KEY;
  const email = process.env.GESTAOCLICK_EMAIL;
  if (!baseUrl || !apiKey || !email) {
    throw new Error("Credenciais GestãoClick em falta");
  }
  return {
    base: normalizeBaseUrl(baseUrl),
    headers: {
      "access-token": apiKey,
      "secret-access-token": email,
      Accept: "application/json",
      "Content-Type": "application/json",
    } as Record<string, string>,
  };
}

async function gcPost(path: string, body: unknown) {
  const { base, headers } = gcCreds();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `GestãoClick ${path} ${res.status}: resposta não-JSON — ${text.slice(0, 400)}`,
    );
  }
  const apiError =
    json &&
    (json.code === 400 ||
      json.code === 401 ||
      json.code === 422 ||
      json.status === "error" ||
      json.error);
  if (!res.ok || apiError) {
    const detail =
      json?.message ||
      json?.error ||
      (json ? JSON.stringify(json).slice(0, 400) : text.slice(0, 400));
    throw new Error(`GestãoClick ${path} ${res.status}: ${detail}`);
  }
  return json;
}

async function gcGetFirstId(path: string, key: string): Promise<string | null> {
  try {
    const { base, headers } = gcCreds();
    const res = await gcFetch(`${base}${path}`, headers);
    const arr: any[] = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json) ? res.json : [];
    const row = arr[0];
    const first =
      row?.[key] ??
      (row && typeof row === "object" && Object.keys(row).length === 1 ? Object.values(row)[0] : row);
    return first?.id ? String(first.id) : null;
  } catch {
    return null;
  }
}

async function findSupplierByDoc(doc: string | null): Promise<string | null> {
  if (!doc) return null;
  try {
    const { base, headers } = gcCreds();
    const res = await gcFetch(`${base}/api/fornecedores?cpf_cnpj=${encodeURIComponent(doc)}`, headers);
    const arr: any[] = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json) ? res.json : [];
    const first = arr[0]?.fornecedor ?? arr[0];
    return first?.id ? String(first.id) : null;
  } catch {
    return null;
  }
}

async function findSupplierByName(name: string): Promise<string | null> {
  try {
    const { base, headers } = gcCreds();
    const res = await gcFetch(`${base}/api/fornecedores?nome=${encodeURIComponent(name)}`, headers);
    const arr: any[] = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json) ? res.json : [];
    const first = arr[0]?.fornecedor ?? arr[0];
    return first?.id ? String(first.id) : null;
  } catch {
    return null;
  }
}

async function createSupplier(name: string, doc: string | null): Promise<string> {
  const body: Record<string, unknown> = {
    tipo_pessoa: doc && doc.replace(/\D/g, "").length === 9 ? "PJ" : "PF",
    nome: name,
  };
  if (doc) body.cpf_cnpj = doc;
  const res = await gcPost("/api/fornecedores", body);
  const id = res?.data?.id ?? res?.id ?? res?.fornecedor?.id;
  if (!id) throw new Error("GestãoClick não devolveu id do novo fornecedor");
  return String(id);
}

async function findProductByName(name: string): Promise<string | null> {
  try {
    const { base, headers } = gcCreds();
    const res = await gcFetch(`${base}/api/produtos?nome=${encodeURIComponent(name)}`, headers);
    const arr: any[] = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json) ? res.json : [];
    const first = arr[0]?.produto ?? arr[0];
    return first?.id ? String(first.id) : null;
  } catch {
    return null;
  }
}

async function findFormaPagamentoByName(candidates: string[]): Promise<string | null> {
  if (candidates.length === 0) return null;
  try {
    const { base, headers } = gcCreds();
    const res = await gcFetch(`${base}/api/formas_pagamentos`, headers);
    const arr: any[] = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json) ? res.json : [];
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const wanted = candidates.map(norm);
    for (const row of arr) {
      const fp = row?.forma_pagamento ?? row;
      const name = norm(String(fp?.nome ?? ""));
      if (wanted.some((w) => name === w || name.includes(w))) {
        return fp?.id ? String(fp.id) : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function paymentMethodCandidates(mode: "paga" | "em_aberto", method: string | null): string[] {
  if (mode === "em_aberto") return ["pagar na entrega", "pagamento na entrega", "a prazo", "entrega"];
  switch ((method ?? "").toLowerCase()) {
    case "transferencia":
      return ["transferencia", "transferência", "transferencia bancaria"];
    case "multibanco":
      return ["multibanco", "mb"];
    case "mbway":
      return ["mb way", "mbway"];
    case "dinheiro":
      return ["dinheiro", "numerario", "numerário"];
    case "cartao":
      return ["cartao", "cartão", "cartao credito", "cartao debito"];
    default:
      return method ? [method] : [];
  }
}

function slugCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 20);
  return `${base || "PROD"}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function numericId(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function roundMoney(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

async function createProduct(name: string, cost: number): Promise<string> {
  const body = {
    nome: name,
    codigo_interno: slugCode(name),
    valor_custo: cost,
    valor_venda: cost,
    movimenta_estoque: 1,
  };
  const res = await gcPost("/api/produtos", body);
  const id = res?.data?.id ?? res?.id ?? res?.produto?.id;
  if (!id) throw new Error("GestãoClick não devolveu id do novo produto");
  return String(id);
}

// ============ Public server functions ============

const ExtractSchema = z.object({
  fileBase64: z.string().min(50).max(20_000_000), // up to ~15MB base64
  mimeType: z.string().min(3).max(80),
});

export const extractInvoiceFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractSchema.parse(d))
  .handler(async ({ data }): Promise<{ extracted: ExtractedInvoice | null; error: string | null }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { extracted: null, error: "LOVABLE_API_KEY em falta" };

    const dataUrl = `data:${data.mimeType};base64,${data.fileBase64}`;

    const systemPrompt = `És um assistente que extrai dados de faturas de fornecedores (Portugal/UE).
Devolves SEMPRE JSON válido com a estrutura pedida. Valores numéricos em euros (ponto decimal).
Se um campo não for legível, devolve null (ou string vazia) e baixa a confidence.
Datas no formato YYYY-MM-DD.`;

    const userInstruction = `Extrai os dados da fatura nesta imagem.
Para cada item indica: descrição, quantidade, preço unitário, total da linha, taxa de IVA (%) e confidence (0..1).
No fim devolve subtotal (sem IVA), vat_total, total e overall_confidence.`;

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userInstruction },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_invoice",
            description: "Submete os dados extraídos da fatura",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                supplier_name: { type: "string" },
                supplier_document: { type: ["string", "null"] },
                invoice_number: { type: "string" },
                invoice_date: { type: ["string", "null"] },
                due_date: { type: ["string", "null"] },
                subtotal: { type: "number" },
                vat_total: { type: "number" },
                total: { type: "number" },
                overall_confidence: { type: "number" },
                notes: { type: ["string", "null"] },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      description: { type: "string" },
                      quantity: { type: "number" },
                      unit_price: { type: "number" },
                      total: { type: "number" },
                      vat_rate: { type: ["number", "null"] },
                      confidence: { type: "number" },
                    },
                    required: ["description", "quantity", "unit_price", "total", "vat_rate", "confidence"],
                  },
                },
              },
              required: [
                "supplier_name",
                "supplier_document",
                "invoice_number",
                "invoice_date",
                "due_date",
                "subtotal",
                "vat_total",
                "total",
                "overall_confidence",
                "notes",
                "items",
              ],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_invoice" } },
    };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429) return { extracted: null, error: "Limite IA atingido. Tenta novamente em alguns segundos." };
      if (res.status === 402) return { extracted: null, error: "Créditos Lovable AI esgotados." };
      if (!res.ok) {
        const t = await res.text();
        return { extracted: null, error: `IA respondeu ${res.status}: ${t.slice(0, 300)}` };
      }
      const json = await res.json();
      const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
      const argsStr = toolCall?.function?.arguments;
      if (!argsStr) return { extracted: null, error: "IA não devolveu dados estruturados" };
      const parsed = JSON.parse(argsStr) as ExtractedInvoice;
      return { extracted: parsed, error: null };
    } catch (e) {
      return { extracted: null, error: e instanceof Error ? e.message : "Falha na extração" };
    }
  });

// ----- Create purchase in GestãoClick + persist locally -----

const ItemInput = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  total: z.number().nonnegative(),
  vat_rate: z.number().nullable(),
});

const CreatePurchaseSchema = z.object({
  importedPurchaseId: z.string().uuid().nullable(),
  supplier_name: z.string().min(1).max(255),
  supplier_document: z.string().max(40).nullable(),
  invoice_number: z.string().min(1).max(60),
  invoice_date: z.string().min(8).max(10),
  due_date: z.string().min(8).max(10).nullable(),
  total: z.number().nonnegative(),
  items: z.array(ItemInput).min(1).max(200),
  finance: z.object({
    mode: z.enum(["paga", "em_aberto"]),
    payment_date: z.string().min(8).max(10).nullable(),
    payment_method: z.string().max(40).nullable(),
  }),
  notes: z.string().max(2000).nullable(),
});

export const createPurchaseInGestaoClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreatePurchaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    try {
      // 1) Supplier
      let supplierId = await findSupplierByDoc(data.supplier_document);
      if (!supplierId) {
        supplierId = await findSupplierByName(data.supplier_name);
      }
      if (!supplierId) {
        supplierId = await createSupplier(data.supplier_name, data.supplier_document);
      }

      // 2) Products (match-or-create)
      const produtos: Array<{ produto: Record<string, unknown> }> = [];
      for (const it of data.items) {
        let pid = await findProductByName(it.description);
        if (!pid) {
          pid = await createProduct(it.description, it.unit_price);
        }
        const lineTotal = roundMoney(Number(it.quantity) * Number(it.unit_price));
        produtos.push({
          produto: {
            id: numericId(pid),
            nome_produto: it.description.slice(0, 200),
            detalhes: "",
            quantidade: it.quantity,
            valor_custo: it.unit_price,
            valor_total: lineTotal,
            unidade: "UN",
          },
        });
      }

      // 3) Purchase — format aligned with GestãoClick purchases payload
      const [situacaoId, planoContasId, formaPagamentoId, contaBancariaId] = await Promise.all([
        gcGetFirstId("/api/situacoes_compras", "situacao"),
        gcGetFirstId("/api/planos_contas", "plano_conta"),
        gcGetFirstId("/api/formas_pagamentos", "forma_pagamento"),
        gcGetFirstId("/api/contas_bancarias", "conta_bancaria"),
      ]);
      if (!situacaoId) {
        throw new Error(
          "GestãoClick: nenhuma 'situação de compra' encontrada. Cria uma em GestãoClick → Compras → Situações.",
        );
      }

      const valorProdutos = roundMoney(
        data.items.reduce(
          (sum, item) => sum + roundMoney(Number(item.quantity) * Number(item.unit_price)),
          0,
        ),
      );
      const valorImpostos = roundMoney(Math.max(Number(data.total) - valorProdutos, 0));
      const valorTotalCompra = Number((valorProdutos + valorImpostos).toFixed(2));
      const codigoCompra = Number(String(Date.now()).slice(-6));
      const pagamentos =
        data.finance.mode === "paga"
          ? [
              {
                pagamento: {
                  data_vencimento: data.due_date ?? data.invoice_date,
                  valor: valorTotalCompra,
                  forma_pagamento_id: formaPagamentoId ? numericId(formaPagamentoId) : undefined,
                  plano_contas_id: planoContasId ? numericId(planoContasId) : undefined,
                  observacao: `Fatura ${data.invoice_number}`,
                  liquidado: "pg",
                },
              },
            ]
          : undefined;
      const compraBody: Record<string, unknown> = {
        codigo: codigoCompra,
        fornecedor_id: numericId(supplierId),
        situacao_id: numericId(situacaoId),
        data: data.invoice_date,
        numero_nfe: data.invoice_number || undefined,
        valor_produtos: valorProdutos,
        valor_impostos: valorImpostos,
        valor_frete: 0,
        pagar_frete: 1,
        valor_total: valorTotalCompra,
        produtos,
        pagamentos,
        observacoes: `Fatura ${data.invoice_number}`,
        observacoes_interna: data.notes ?? undefined,
      };
      const compraRes = await gcPost("/api/compras", compraBody);
      const compraId = String(
        compraRes?.data?.id ?? compraRes?.id ?? compraRes?.compra?.id ?? "",
      );

      // 4) Optional extra payment sync only when user marked as paid
      let contaWarning: string | null = null;
      if (data.finance.mode === "paga" && (!planoContasId || !formaPagamentoId || !contaBancariaId)) {
        contaWarning =
          "Lançamento financeiro não criado: configura em GestãoClick um Plano de contas, Forma de pagamento e Conta bancária padrão.";
      } else if (data.finance.mode === "paga") {
        const pagamentoBody: Record<string, unknown> = {
          fornecedor_id: supplierId,
          descricao: `Fatura ${data.invoice_number} — ${data.supplier_name}`,
          valor: valorTotalCompra,
          data_vencimento: data.due_date ?? data.invoice_date,
          data_competencia: data.invoice_date,
          plano_contas_id: planoContasId,
          forma_pagamento_id: formaPagamentoId,
          conta_bancaria_id: contaBancariaId,
          numero_documento: data.invoice_number,
        };
        if (data.finance.mode === "paga") {
          pagamentoBody.data_pagamento = data.finance.payment_date ?? data.invoice_date;
          pagamentoBody.liquidado = "pg";
        }
        try {
          await gcPost("/api/pagamentos", pagamentoBody);
        } catch (e) {
          contaWarning = e instanceof Error ? e.message : "Falha ao criar pagamento";
        }
      }

      // 5) Persist local record
      if (data.importedPurchaseId) {
        await supabaseAdmin
          .from("imported_purchases")
          .update({
            status: contaWarning ? "enviada_parcial" : "enviada",
            error_message: contaWarning,
            gestaoclick_purchase_id: compraId || null,
            gestaoclick_invoice_number: data.invoice_number,
            supplier_name: data.supplier_name,
            supplier_document: data.supplier_document,
            total_value: data.total,
            final_payload: data as unknown as never,
          })
          .eq("id", data.importedPurchaseId);
      } else {
        await supabaseAdmin.from("imported_purchases").insert({
          created_by: context.userId,
          status: contaWarning ? "enviada_parcial" : "enviada",
          error_message: contaWarning,
          gestaoclick_purchase_id: compraId || null,
          gestaoclick_invoice_number: data.invoice_number,
          supplier_name: data.supplier_name,
          supplier_document: data.supplier_document,
          total_value: data.total,
          final_payload: data as unknown as never,
        });
      }


      return { ok: true, compraId, warning: contaWarning };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao criar compra";
      if (data.importedPurchaseId) {
        await supabaseAdmin
          .from("imported_purchases")
          .update({ status: "erro", error_message: msg })
          .eq("id", data.importedPurchaseId);
      }
      return { ok: false, compraId: null, warning: null, error: msg };
    }
  });

// ----- Save extraction draft (so we can attach image + payload before review) -----

const SaveDraftSchema = z.object({
  imagePath: z.string().max(500).nullable(),
  extracted: z.unknown(),
});

export const saveExtractionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveDraftSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("imported_purchases")
      .insert({
        created_by: context.userId,
        status: "rascunho",
        image_path: data.imagePath,
        extracted_payload: data.extracted as never,
      })

      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

// ----- List history -----

export const listImportedPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("imported_purchases")
      .select("id, created_at, supplier_name, gestaoclick_invoice_number, gestaoclick_purchase_id, total_value, status, error_message")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
