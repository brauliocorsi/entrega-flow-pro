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
      // serialize arrays as JSON to keep all data
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
    if (data.length < 20) break; // heuristic stop
    page++;
  }
  return all;
}

async function gsheetFetch(path: string, init: RequestInit = {}): Promise<any> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !lovableKey) throw new Error("Google Sheets connector não configurado");
  const url = `https://connector-gateway.lovable.dev/google_sheets/v4${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Sheets API ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

export const exportProductsToGoogleSheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas administradores podem exportar produtos");

    const products = await fetchAllProducts("ativo");
    if (products.length === 0) {
      throw new Error("Nenhum produto encontrado no GestãoClick");
    }

    // Collect all keys across products
    const keySet = new Set<string>();
    for (const p of products) for (const k of Object.keys(p)) keySet.add(k);

    // Order: put common useful fields first, then the rest alphabetically
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

    const rows: any[][] = [
      headers,
      ...products.map((p) =>
        headers.map((h) => {
          const v = p[h];
          if (v === null || v === undefined) return "";
          if (typeof v === "object") return JSON.stringify(v);
          return v;
        }),
      ),
    ];

    // Create spreadsheet
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace("T", " ");
    const sheetTitle = "Produtos";
    const created = await gsheetFetch("/spreadsheets", {
      method: "POST",
      body: JSON.stringify({
        properties: { title: `Produtos GestãoClick — ${stamp}` },
        sheets: [{ properties: { title: sheetTitle } }],
      }),
    });
    const spreadsheetId: string = created.spreadsheetId;
    const spreadsheetUrl: string = created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    // Write values
    const range = `${sheetTitle}!A1`;
    await gsheetFetch(
      `/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
      {
        method: "PUT",
        body: JSON.stringify({ range, majorDimension: "ROWS", values: rows }),
      },
    );

    return {
      ok: true as const,
      spreadsheetId,
      spreadsheetUrl,
      productCount: products.length,
      columnCount: headers.length,
    };
  });
