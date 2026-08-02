import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBaseUrl, gcFetch } from "./gestaoclick-core.server";
import { getUserRoles } from "./route-lock.server";

type PickRow = {
  code: string;
  name: string;
  qty: number;
  confirm: boolean;
};

function gcHeaders() {
  const baseUrl = process.env.GESTAOCLICK_BASE_URL;
  const apiKey = process.env.GESTAOCLICK_API_KEY;
  const email = process.env.GESTAOCLICK_EMAIL;
  if (!baseUrl || !apiKey || !email) return null;
  return {
    base: normalizeBaseUrl(baseUrl),
    headers: {
      "access-token": apiKey,
      "secret-access-token": email,
      Accept: "application/json",
    } as Record<string, string>,
  };
}

/** Procura o código do produto no GestãoClick pelo nome (correspondência exata, sem acentos). */
async function resolveCodeByName(name: string): Promise<string | null> {
  const gc = gcHeaders();
  if (!gc) return null;
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  try {
    const res = await gcFetch(
      `${gc.base}/api/produtos?nome=${encodeURIComponent(name)}`,
      gc.headers,
    );
    const list: any[] = Array.isArray(res.json?.data) ? res.json.data : [];
    const target = clean(name);
    for (const wrap of list) {
      const p = wrap?.produto ?? wrap;
      const pn = clean(String(p?.nome ?? ""));
      if (pn === target) return String(p?.codigo ?? p?.codigo_interno ?? p?.id ?? "") || null;
    }
    const first = list[0]?.produto ?? list[0];
    if (first && clean(String(first?.nome ?? "")).startsWith(target.slice(0, 20))) {
      return String(first?.codigo ?? first?.id ?? "") || null;
    }
  } catch {
    return null;
  }
  return null;
}

export const exportRoutePicking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ route_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getUserRoles(context);
    if (!roles.includes("admin") && !roles.includes("logistico")) {
      throw new Error("Apenas administradores ou logística podem exportar a separação");
    }

    const { data: route, error: rErr } = await context.supabase
      .from("routes")
      .select("id, route_date, zone, driver, assistant, vehicle")
      .eq("id", data.route_id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!route) throw new Error("Rota não encontrada");

    const { data: deliveries, error: dErr } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, order_number, customer_name, status, stop_order, order_payload")
      .eq("route_id", data.route_id)
      .in("status", ["agendado", "confirmado", "entregue"])
      .order("stop_order", { ascending: true, nullsFirst: false });
    if (dErr) throw new Error(dErr.message);

    type Line = { order: string; customer: string; code: string; name: string; qty: number };
    const lines: Line[] = [];
    for (const d of deliveries ?? []) {
      const payload: any = d.order_payload ?? {};
      const items: any[] = Array.isArray(payload.items) ? payload.items : [];
      for (const it of items) {
        if (it?.kind !== "produto") continue;
        lines.push({
          order: String(d.order_number ?? ""),
          customer: String(d.customer_name ?? ""),
          code: String(it?.code ?? it?.codigo ?? "").trim(),
          name: String(it?.description ?? "").trim(),
          qty: Number(it?.quantity ?? 1) || 0,
        });
      }
    }

    // Resolve códigos em falta no GestãoClick (uma vez por nome distinto).
    const missing = [...new Set(lines.filter((l) => !l.code && l.name).map((l) => l.name))];
    const resolved = new Map<string, string | null>();
    for (const name of missing.slice(0, 80)) {
      resolved.set(name, await resolveCodeByName(name));
    }
    for (const l of lines) {
      if (!l.code) l.code = resolved.get(l.name) ?? "";
    }

    // Agregação por código/nome
    const agg = new Map<string, PickRow>();
    for (const l of lines) {
      const key = (l.code || `~${l.name.toLowerCase()}`).trim();
      const row = agg.get(key) ?? { code: l.code, name: l.name, qty: 0, confirm: !l.code };
      row.qty += l.qty;
      agg.set(key, row);
    }
    const rows = [...agg.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));

    const header = [
      ["Separação de produtos — Rota"],
      [`Data: ${route.route_date}`, `Zona: ${route.zone ?? ""}`],
      [
        `Motorista: ${route.driver ?? "—"}`,
        `Auxiliar: ${route.assistant ?? "—"}`,
        `Viatura: ${route.vehicle ?? "—"}`,
      ],
      [],
      ["Código", "Produto", "Quantidade", "Observação"],
    ];
    const body = rows.map((r) => [r.code, r.name, r.qty, r.confirm ? "código por confirmar" : ""]);
    const ws1 = XLSX.utils.aoa_to_sheet([...header, ...body]);
    ws1["!cols"] = [{ wch: 16 }, { wch: 60 }, { wch: 12 }, { wch: 22 }];

    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Nº encomenda", "Cliente", "Código", "Produto", "Quantidade"],
      ...lines.map((l) => [l.order, l.customer, l.code, l.name, l.qty]),
    ]);
    ws2["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 16 }, { wch: 60 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Separação");
    XLSX.utils.book_append_sheet(wb, ws2, "Por entrega");
    const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" }) as string;

    return {
      ok: true as const,
      filename: `separacao-rota-${route.route_date}-${String(route.zone ?? "").replace(/\W+/g, "-")}.xlsx`,
      base64,
      productCount: rows.length,
      totalQty: rows.reduce((a, r) => a + r.qty, 0),
      unresolved: rows.filter((r) => r.confirm).length,
    };
  });
