import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const scopeSchema = z.object({
  scope: z.enum(["rota", "periodo"]).default("periodo"),
  route_id: z.string().uuid().nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Carrega e interpreta um extrato bancário (CSV/Excel direto, PDF/foto por IA). */
export const uploadStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        file_name: z.string().min(1).max(200),
        mime: z.string().min(1).max(120),
        base64: z.string().min(10),
        scope: z.enum(["rota", "periodo"]).default("periodo"),
        route_id: z.string().uuid().nullable().optional(),
        period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireManager, displayName } = await import("./reconciliation-guard.server");
    await requireManager(context);

    const { parseTabular, parseWithAI } = await import("./reconciliation.server");
    const tabular = /\.(csv|txt|xls|xlsx)$/i.test(data.file_name);
    const kind = tabular ? "tabular" : data.mime.startsWith("image/") ? "imagem" : "pdf";

    let movements;
    try {
      movements = tabular
        ? parseTabular(data.base64, data.file_name)
        : await parseWithAI(data.base64, data.mime, data.file_name);
    } catch (e: any) {
      throw new Error(e?.message ?? "Não foi possível ler o documento");
    }
    if (movements.length === 0) throw new Error("Nenhum movimento encontrado no documento");

    const { data: statement, error } = await context.supabase
      .from("bank_statements")
      .insert({
        file_name: data.file_name,
        kind,
        scope: data.scope,
        route_id: data.route_id ?? null,
        period_start: data.period_start ?? null,
        period_end: data.period_end ?? null,
        status: "processado",
        transactions_count: movements.length,
        uploaded_by: context.userId,
        uploaded_by_name: await displayName(context),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: txErr } = await context.supabase.from("bank_transactions").insert(
      movements.map((m) => ({
        statement_id: statement.id,
        tx_date: m.tx_date,
        amount: m.amount,
        description: m.description,
        reference: m.reference,
        method: m.method,
        status: "por_conciliar",
      })),
    );
    if (txErr) throw new Error(txErr.message);

    return { ok: true, statement_id: statement.id, count: movements.length };
  });

/** Estado da conciliação: movimentos, recebimentos não-dinheiro e sugestões. */
export const getReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scopeSchema.default({}).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { requireManager, suggest, isCashMethod } = await import("./reconciliation-guard.server");
    await requireManager(context);

    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    let routeQ = context.supabase
      .from("routes")
      .select("id, zone, route_date, driver, assistant, color");
    routeQ =
      data.scope === "rota" && data.route_id
        ? routeQ.eq("id", data.route_id)
        : routeQ.gte("route_date", from).lte("route_date", to);
    const { data: routes, error: rErr } = await routeQ;
    if (rErr) throw new Error(rErr.message);
    const routeIds = (routes ?? []).map((r: any) => r.id);

    const { data: payments } = routeIds.length
      ? await context.supabase
          .from("delivery_payments")
          .select(
            "id, route_id, delivery_id, method_name, amount, received_by_name, created_at, confirmed, reconciled_at, bank_transaction_id",
          )
          .in("route_id", routeIds)
      : { data: [] as any[] };

    const deliveryIds = Array.from(new Set((payments ?? []).map((p: any) => p.delivery_id)));
    const { data: deliveries } = deliveryIds.length
      ? await context.supabase
          .from("scheduled_deliveries")
          .select("id, order_number, customer_name")
          .in("id", deliveryIds)
      : { data: [] as any[] };
    const dMap = new Map((deliveries ?? []).map((d: any) => [d.id, d]));
    const rMap = new Map((routes ?? []).map((r: any) => [r.id, r]));

    let stQ = context.supabase
      .from("bank_statements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data.scope === "rota" && data.route_id) stQ = stQ.eq("route_id", data.route_id);
    const { data: statements } = await stQ;
    const statementIds = (statements ?? []).map((s: any) => s.id);

    const { data: txs } = statementIds.length
      ? await context.supabase
          .from("bank_transactions")
          .select("*")
          .in("statement_id", statementIds)
          .order("tx_date", { ascending: true })
      : { data: [] as any[] };

    const eligible = (payments ?? [])
      .filter((p: any) => !isCashMethod(p.method_name))
      .map((p: any) => {
        const d = dMap.get(p.delivery_id);
        const r = rMap.get(p.route_id);
        return {
          id: p.id,
          amount: Number(p.amount),
          method_name: p.method_name,
          created_at: p.created_at,
          received_by_name: p.received_by_name ?? null,
          confirmed: !!p.confirmed,
          reconciled_at: p.reconciled_at ?? null,
          bank_transaction_id: p.bank_transaction_id ?? null,
          order_number: d?.order_number ?? "—",
          customer_name: d?.customer_name ?? "—",
          route_id: p.route_id,
          route_zone: r?.zone ?? null,
          route_date: r?.route_date ?? null,
        };
      });

    const transactions = (txs ?? []).map((t: any) => ({
      ...t,
      amount: Number(t.amount),
      matched_payment: eligible.find((p) => p.id === t.matched_payment_id) ?? null,
      suggestions: t.status === "por_conciliar" ? suggest(t, eligible) : [],
    }));

    return {
      scope: data.scope,
      from,
      to,
      statements: statements ?? [],
      transactions,
      payments: eligible,
      totals: {
        statement_total: Math.round(transactions.reduce((a, t: any) => a + t.amount, 0) * 100) / 100,
        matched_total:
          Math.round(
            transactions
              .filter((t: any) => t.status === "conciliado")
              .reduce((a, t: any) => a + t.amount, 0) * 100,
          ) / 100,
        unmatched: transactions.filter((t: any) => t.status === "por_conciliar").length,
        payments_pending: eligible.filter((p) => !p.reconciled_at).length,
      },
    };
  });

/** Liga (revisão humana) um movimento a um recebimento e confirma-o. */
export const applyMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ transaction_id: z.string().uuid(), payment_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireManager } = await import("./reconciliation-guard.server");
    await requireManager(context);
    const now = new Date().toISOString();

    const { error: tErr } = await context.supabase
      .from("bank_transactions")
      .update({
        status: "conciliado",
        matched_payment_id: data.payment_id,
        matched_by: context.userId,
        matched_at: now,
      })
      .eq("id", data.transaction_id);
    if (tErr) throw new Error(tErr.message);

    const { error: pErr } = await context.supabase
      .from("delivery_payments")
      .update({
        bank_transaction_id: data.transaction_id,
        reconciled_at: now,
        reconciled_by: context.userId,
        confirmed: true,
        confirmed_by: context.userId,
        confirmed_at: now,
      })
      .eq("id", data.payment_id);
    if (pErr) throw new Error(pErr.message);
    return { ok: true };
  });

/** Desfaz uma conciliação. */
export const unmatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ transaction_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireManager } = await import("./reconciliation-guard.server");
    await requireManager(context);

    const { data: tx } = await context.supabase
      .from("bank_transactions")
      .select("matched_payment_id")
      .eq("id", data.transaction_id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("bank_transactions")
      .update({ status: "por_conciliar", matched_payment_id: null, matched_by: null, matched_at: null })
      .eq("id", data.transaction_id);
    if (error) throw new Error(error.message);

    if (tx?.matched_payment_id) {
      await context.supabase
        .from("delivery_payments")
        .update({ bank_transaction_id: null, reconciled_at: null, reconciled_by: null })
        .eq("id", tx.matched_payment_id);
    }
    return { ok: true };
  });

/** Marca (ou repõe) um movimento como ignorado. */
export const ignoreTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ transaction_id: z.string().uuid(), ignored: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requireManager } = await import("./reconciliation-guard.server");
    await requireManager(context);
    const { error } = await context.supabase
      .from("bank_transactions")
      .update({ status: data.ignored ? "ignorado" : "por_conciliar" })
      .eq("id", data.transaction_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove um extrato e os seus movimentos. */
export const deleteStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireManager } = await import("./reconciliation-guard.server");
    await requireManager(context);
    const { error } = await context.supabase.from("bank_statements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
