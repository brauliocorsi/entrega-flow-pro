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
  if (!res.ok) {
    throw new Error(`GestãoClick POST ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`GestãoClick devolveu resposta inválida em ${path}`);
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

async function createProduct(name: string, cost: number): Promise<string> {
  const body = {
    nome: name,
    valor_venda: cost,
    valor_custo: cost,
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
        supplierId = await createSupplier(data.supplier_name, data.supplier_document);
      }

      // 2) Products (match-or-create)
      const produtos: Array<{ produto: { produto_id: string; quantidade: number; valor: number } }> = [];
      for (const it of data.items) {
        let pid = await findProductByName(it.description);
        if (!pid) {
          pid = await createProduct(it.description, it.unit_price);
        }
        produtos.push({
          produto: {
            produto_id: pid,
            quantidade: it.quantity,
            valor: it.unit_price,
          },
        });
      }

      // 3) Purchase
      const compraBody: Record<string, unknown> = {
        fornecedor_id: supplierId,
        data: data.invoice_date,
        numero_nota_fiscal: data.invoice_number,
        valor_total: data.total,
        produtos,
        observacoes: data.notes ?? undefined,
      };
      const compraRes = await gcPost("/api/compras", compraBody);
      const compraId = String(
        compraRes?.data?.id ?? compraRes?.id ?? compraRes?.compra?.id ?? "",
      );

      // 4) Account payable
      const contaBody: Record<string, unknown> = {
        fornecedor_id: supplierId,
        descricao: `Fatura ${data.invoice_number} — ${data.supplier_name}`,
        valor: data.total,
        data_vencimento: data.due_date ?? data.invoice_date,
        numero_documento: data.invoice_number,
        situacao: data.finance.mode === "paga" ? 1 : 0, // 1=paga, 0=em aberto (heurística comum)
      };
      if (data.finance.mode === "paga") {
        contaBody.data_pagamento = data.finance.payment_date ?? data.invoice_date;
      }
      if (compraId) contaBody.compra_id = compraId;
      let contaWarning: string | null = null;
      try {
        await gcPost("/api/contas_pagar", contaBody);
      } catch (e) {
        contaWarning = e instanceof Error ? e.message : "Falha ao criar conta a pagar";
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
