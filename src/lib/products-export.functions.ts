import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBaseUrl, gcFetch } from "./gestaoclick-core.server";

function flatten(obj: any, prefix = "", out: Record<string, any> = {}): Record<string, any> {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    out[prefix || "valor"] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, key, out);
    } else if (Array.isArray(v)) {
      out[key] = JSON.stringify(v);
    } else {
      out[key] = v;
    }
  }
  return out;
}

async function fetchAllProducts(situation: "ativo" | "all"): Promise<Record<string, any>[]> {
  const baseUrl = process.env.GESTAOCLICK_BASE_URL;
  const apiKey = process.env.GESTAOCLICK_API_KEY;
  const email = process.env.GESTAOCLICK_EMAIL;
  if (!baseUrl || !apiKey || !email) throw new Error("Credenciais GestãoClick em falta");
  const base = normalizeBaseUrl(baseUrl);
  const headers = {
    "access-token": apiKey,
    "secret-access-token": email,
    Accept: "application/json",
  };

  const all: Record<string, any>[] = [];
  let page = 1;
  const maxPages = 200;
  while (page <= maxPages) {
    const url = `${base}/api/produtos?pagina=${page}${situation === "ativo" ? "&situacao=ativo" : ""}`;
    const res = await gcFetch(url, headers);
    const data: any[] = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json) ? res.json : [];
    if (data.length === 0) break;
    for (const wrap of data) {
      const p = wrap?.produto ?? wrap;
      all.push(flatten(p));
    }
    const meta = res.json?.meta;
    const totalPages = Number(meta?.total_paginas ?? meta?.last_page ?? 0);
    if (totalPages && page >= totalPages) break;
    if (data.length < 20) break;
    page++;
  }
  return all;
}

function toCsv(headers: string[], rows: Record<string, any>[]): string {
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
  // BOM for Excel UTF-8 detection
  return "\ufeff" + lines.join("\n");
}

export const exportProductsToCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas administradores podem exportar produtos");

    const products = await fetchAllProducts("ativo");
    if (products.length === 0) throw new Error("Nenhum produto encontrado no GestãoClick");

    const keySet = new Set<string>();
    for (const p of products) for (const k of Object.keys(p)) keySet.add(k);

    const preferred = [
      "id", "codigo", "codigo_barra", "codigo_barras",
      "nome", "descricao",
      "categoria.nome", "marca.nome", "tipo", "unidade",
      "ncm", "cest", "origem",
      "estoque", "estoque_minimo", "estoque_maximo", "localizacao",
      "valor_custo", "valor_venda", "margem_lucro",
      "peso_liquido", "peso_bruto", "altura", "largura", "comprimento",
      "garantia", "situacao", "observacoes",
      "data_cadastro", "data_alteracao", "cadastrado_em", "alterado_em",
    ];
    const remaining = [...keySet].filter((k) => !preferred.includes(k)).sort();
    const headers = [...preferred.filter((k) => keySet.has(k)), ...remaining];

    const csv = toCsv(headers, products);
    const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    return {
      ok: true as const,
      filename: `produtos-gestaoclick-${stamp}.csv`,
      csv,
      productCount: products.length,
      columnCount: headers.length,
    };
  });
