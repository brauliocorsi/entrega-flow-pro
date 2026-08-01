import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeDeliveryTotals } from "@/lib/delivery-totals";

const CASH_METHOD = "dinheiro";

export const EXPENSE_CATEGORIES = [
  "Gasóleo",
  "Ferramentas",
  "Adiantamento",
  "Refeição",
  "Portagens",
  "Outro",
] as const;

function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

function isCash(methodName: string) {
  return norm(methodName).includes(CASH_METHOD);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function roles(ctx: any): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return (data ?? []).map((r: any) => r.role);
}

async function displayName(ctx: any): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data?.display_name ?? data?.email ?? null;
}

async function assertAdmin(ctx: any) {
  const list = await roles(ctx);
  if (!list.includes("admin")) throw new Error("Apenas administradores podem fazer esta operação");
}

function envelopeCode(route: any) {
  const zone = (route.zone ?? "ROTA")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const suffix = String(route.id).replace(/-/g, "").slice(0, 4).toUpperCase();
  return `ENV-${route.route_date}-${zone || "ROTA"}-${suffix}`;
}

async function buildCash(ctx: any, routeId: string) {
  const { data: route, error } = await ctx.supabase
    .from("routes")
    .select("id, zone, route_date, driver, assistant, status, color")
    .eq("id", routeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!route) throw new Error("Rota não encontrada ou sem acesso");

  const { data: payments } = await ctx.supabase
    .from("delivery_payments")
    .select(
      "id, method_name, amount, received_by_name, created_at, delivery_id, confirmed, confirmed_at",
    )
    .eq("route_id", routeId)
    .order("created_at", { ascending: true });

  const { data: expenses } = await ctx.supabase
    .from("route_cash_expenses")
    .select("*")
    .eq("route_id", routeId)
    .order("created_at", { ascending: true });

  const { data: settlement } = await ctx.supabase
    .from("route_settlements")
    .select("*")
    .eq("route_id", routeId)
    .maybeSingle();

  const { data: deliveries } = await ctx.supabase
    .from("scheduled_deliveries")
    .select(
      "id, order_number, customer_name, status, outcome, total_value, paid_value, remaining_value, order_payload",
    )
    .eq("route_id", routeId)
    .order("order_number", { ascending: true });

  const byMethod = new Map<string, number>();
  for (const p of payments ?? []) {
    byMethod.set(p.method_name, round2((byMethod.get(p.method_name) ?? 0) + Number(p.amount)));
  }

  const cashIn = round2(
    (payments ?? [])
      .filter((p: any) => isCash(p.method_name))
      .reduce((a: number, p: any) => a + Number(p.amount), 0),
  );
  const expensesTotal = round2(
    (expenses ?? [])
      .filter((e: any) => e.status !== "rejeitada")
      .reduce((a: number, e: any) => a + Number(e.amount), 0),
  );

  const confirmed = new Map<string, boolean>(
    ((settlement?.methods as any[]) ?? []).map((m: any) => [m.method_name, !!m.confirmed]),
  );

  const orders = (deliveries ?? []).map((d: any) => buildOrderCompare(d, payments ?? []));

  return {
    route,
    payments: payments ?? [],
    expenses: expenses ?? [],
    settlement: settlement ?? null,
    cash_in: cashIn,
    expenses_total: expensesTotal,
    in_hand: round2(cashIn - expensesTotal),
    orders,
    forecast_total: round2(orders.reduce((a: number, o: any) => a + o.forecast, 0)),
    realized_total: round2(orders.reduce((a: number, o: any) => a + o.realized, 0)),
    pending_confirmations: (payments ?? []).filter((p: any) => !p.confirmed).length,
    other_methods: Array.from(byMethod, ([method_name, amount]) => ({ method_name, amount }))
      .filter((m) => !isCash(m.method_name))
      .map((m) => ({ ...m, confirmed: confirmed.get(m.method_name) ?? false })),
    total_received: round2(
      (payments ?? []).reduce((a: number, p: any) => a + Number(p.amount), 0),
    ),
  };
}


/** Caixa de uma rota: recebimentos, despesas, valor em mãos e envelope. */
export const getRouteCash = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ routeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => buildCash(context, data.routeId));

/** Registar saída de dinheiro da rota (com recibo obrigatório). */
export const addCashExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        route_id: z.string().uuid(),
        category: z.string().min(1).max(60),
        amount: z.number().positive().max(100000),
        description: z.string().trim().min(3).max(500),
        receipt_path: z.string().trim().min(3).max(400),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: settlement } = await context.supabase
      .from("route_settlements")
      .select("status")
      .eq("route_id", data.route_id)
      .maybeSingle();
    if (settlement && settlement.status !== "aberta") {
      throw new Error("O envelope desta rota já foi fechado");
    }

    const { data: routeRow } = await context.supabase
      .from("routes")
      .select("status")
      .eq("id", data.route_id)
      .maybeSingle();
    if (routeRow && routeRow.status === "concluida") {
      throw new Error("A rota já foi fechada — não é possível registar novas saídas");
    }

    const { error } = await context.supabase.from("route_cash_expenses").insert({
      route_id: data.route_id,
      category: data.category,
      amount: data.amount,
      description: data.description,
      receipt_path: data.receipt_path,
      created_by: context.userId,
      created_by_name: await displayName(context),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCashExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("route_cash_expenses")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Fechar envelope: entregador declara o valor depositado. */
export const submitSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        route_id: z.string().uuid(),
        cash_declared: z.number().min(0).max(1000000),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const cash = await buildCash(context, data.route_id);
    if (cash.settlement && cash.settlement.status !== "aberta") {
      throw new Error("Este envelope já foi fechado");
    }

    const methods = cash.other_methods.map((m) => ({
      method_name: m.method_name,
      amount: m.amount,
      confirmed: false,
      confirmed_at: null,
    }));

    const payload = {
      route_id: data.route_id,
      envelope_code: cash.settlement?.envelope_code ?? envelopeCode(cash.route),
      cash_expected: cash.in_hand,
      cash_declared: data.cash_declared,
      expenses_total: cash.expenses_total,
      methods,
      status: "entregue",
      submitted_by: context.userId,
      submitted_by_name: await displayName(context),
      submitted_at: new Date().toISOString(),
      notes: data.notes ?? null,
    };

    const { error } = cash.settlement
      ? await context.supabase
          .from("route_settlements")
          .update(payload)
          .eq("id", cash.settlement.id)
      : await context.supabase.from("route_settlements").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true, envelope_code: payload.envelope_code };
  });

/** Admin: aprovar/rejeitar despesa. */
export const reviewExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["aprovada", "rejeitada", "pendente"]),
        review_notes: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("route_cash_expenses")
      .update({
        status: data.status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.review_notes ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: confirmar um método não-dinheiro (conciliação). */
export const confirmSettlementMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        route_id: z.string().uuid(),
        method_name: z.string().min(1).max(100),
        confirmed: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: settlement, error } = await context.supabase
      .from("route_settlements")
      .select("id, methods, status")
      .eq("route_id", data.route_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!settlement) throw new Error("O entregador ainda não fechou o envelope");
    if (settlement.status === "conferida") throw new Error("Conferência já fechada");

    const methods = ((settlement.methods as any[]) ?? []).map((m: any) =>
      m.method_name === data.method_name
        ? {
            ...m,
            confirmed: data.confirmed,
            confirmed_at: data.confirmed ? new Date().toISOString() : null,
          }
        : m,
    );
    const { error: upErr } = await context.supabase
      .from("route_settlements")
      .update({ methods })
      .eq("id", settlement.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/** Admin: fechar a conferência da rota. */
export const closeSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ route_id: z.string().uuid(), notes: z.string().trim().max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const cash = await buildCash(context, data.route_id);
    if (!cash.settlement) throw new Error("O entregador ainda não fechou o envelope");
    if (cash.settlement.status === "conferida") return { ok: true };

    const pendingMethods = ((cash.settlement.methods as any[]) ?? []).filter(
      (m: any) => !m.confirmed,
    );
    if (pendingMethods.length > 0) {
      throw new Error(
        `Faltam confirmar: ${pendingMethods.map((m: any) => m.method_name).join(", ")}`,
      );
    }
    const pendingPayments = (cash.payments ?? []).filter((p: any) => !p.confirmed);
    if (pendingPayments.length > 0) {
      throw new Error(
        `Faltam confirmar ${pendingPayments.length} recebimento(s) individuais das encomendas`,
      );
    }
    const pendingExpenses = cash.expenses.filter((e: any) => e.status === "pendente");
    if (pendingExpenses.length > 0) {
      throw new Error("Há despesas por aprovar ou rejeitar");
    }

    const { error } = await context.supabase
      .from("route_settlements")
      .update({
        status: "conferida",
        reviewed_by: context.userId,
        reviewed_by_name: await displayName(context),
        reviewed_at: new Date().toISOString(),
        notes: data.notes ?? cash.settlement.notes ?? null,
      })
      .eq("id", cash.settlement.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: confirmar (ou reverter) um recebimento individual de uma encomenda. */
export const confirmPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ payment_id: z.string().uuid(), confirmed: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: payment, error: pErr } = await context.supabase
      .from("delivery_payments")
      .select("id, route_id, method_name")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!payment) throw new Error("Recebimento não encontrado");

    const { error } = await context.supabase
      .from("delivery_payments")
      .update({
        confirmed: data.confirmed,
        confirmed_by: data.confirmed ? context.userId : null,
        confirmed_at: data.confirmed ? new Date().toISOString() : null,
      })
      .eq("id", data.payment_id);
    if (error) throw new Error(error.message);

    // Sincroniza o estado agregado do método no envelope da rota.
    const { data: settlement } = await context.supabase
      .from("route_settlements")
      .select("id, methods, status")
      .eq("route_id", payment.route_id)
      .maybeSingle();

    if (settlement && settlement.status !== "conferida") {
      const { data: rest } = await context.supabase
        .from("delivery_payments")
        .select("method_name, confirmed")
        .eq("route_id", payment.route_id);
      const allConfirmed = (name: string) =>
        (rest ?? [])
          .filter((r: any) => r.method_name === name)
          .every((r: any) => !!r.confirmed);
      const methods = ((settlement.methods as any[]) ?? []).map((m: any) => {
        const ok = allConfirmed(m.method_name);
        return { ...m, confirmed: ok, confirmed_at: ok ? new Date().toISOString() : null };
      });
      await context.supabase
        .from("route_settlements")
        .update({ methods })
        .eq("id", settlement.id);
    }

    return { ok: true };
  });

/** Admin/logística: prestação de contas de todas as rotas de uma data. */
export const getSettlementsByDate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const date = data.date ?? new Date().toISOString().slice(0, 10);
    const { data: routes, error } = await context.supabase
      .from("routes")
      .select("id, zone, route_date, driver, assistant, status, color")
      .eq("route_date", date)
      .order("zone", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (routes ?? []).map((r: any) => r.id);
    if (ids.length === 0) return { date, routes: [] };

    const [{ data: payments }, { data: expenses }, { data: settlements }, { data: deliveries }] =
      await Promise.all([
        context.supabase
          .from("delivery_payments")
          .select("id, route_id, delivery_id, method_name, amount, received_by_name, created_at, confirmed, confirmed_at")
          .in("route_id", ids),
        context.supabase.from("route_cash_expenses").select("*").in("route_id", ids),
        context.supabase.from("route_settlements").select("*").in("route_id", ids),
        context.supabase
          .from("scheduled_deliveries")
          .select(
            "id, route_id, order_number, customer_name, status, outcome, total_value, paid_value, remaining_value, order_payload",
          )
          .in("route_id", ids)
          .order("order_number", { ascending: true }),
      ]);

    return {
      date,
      routes: (routes ?? []).map((r: any) => {
        const ps = (payments ?? []).filter((p: any) => p.route_id === r.id);
        const es = (expenses ?? []).filter((e: any) => e.route_id === r.id);
        const st = (settlements ?? []).find((s: any) => s.route_id === r.id) ?? null;
        const cashIn = round2(
          ps.filter((p: any) => isCash(p.method_name)).reduce((a, p: any) => a + Number(p.amount), 0),
        );
        const expTotal = round2(
          es.filter((e: any) => e.status !== "rejeitada").reduce((a, e: any) => a + Number(e.amount), 0),
        );
        const byMethod = new Map<string, number>();
        for (const p of ps) {
          byMethod.set(p.method_name, round2((byMethod.get(p.method_name) ?? 0) + Number(p.amount)));
        }
        const confirmed = new Map<string, boolean>(
          ((st?.methods as any[]) ?? []).map((m: any) => [m.method_name, !!m.confirmed]),
        );
        const orders = (deliveries ?? [])
          .filter((d: any) => d.route_id === r.id)
          .map((d: any) => buildOrderCompare(d, ps));
        return {
          ...r,
          settlement: st,
          expenses: es,
          cash_in: cashIn,
          expenses_total: expTotal,
          in_hand: round2(cashIn - expTotal),
          orders,
          payments_total: ps.length,
          pending_confirmations: ps.filter((p: any) => !p.confirmed).length,
          forecast_total: round2(orders.reduce((a: number, o: any) => a + o.forecast, 0)),
          realized_total: round2(orders.reduce((a: number, o: any) => a + o.realized, 0)),

          other_methods: Array.from(byMethod, ([method_name, amount]) => ({ method_name, amount }))
            .filter((m) => !isCash(m.method_name))
            .map((m) => ({ ...m, confirmed: confirmed.get(m.method_name) ?? false })),
        };
      }),
    };
  });

/** Rotas do entregador (últimos dias) com caixa e estado de envelope. */
export const getMyCashRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(120).optional() }).default({}).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const days = data.days ?? 30;
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const { data: staff } = await context.supabase
      .from("staff")
      .select("name, active")
      .eq("user_id", context.userId);
    const names = (staff ?? []).filter((s: any) => s.active).map((s: any) => norm(s.name));

    const { data: routes, error } = await context.supabase
      .from("routes")
      .select("id, zone, route_date, driver, assistant, status, color")
      .gte("route_date", from)
      .order("route_date", { ascending: false });
    if (error) throw new Error(error.message);

    const mine = (routes ?? []).filter(
      (r: any) =>
        names.length === 0 || names.includes(norm(r.driver)) || names.includes(norm(r.assistant)),
    );
    const ids = mine.map((r: any) => r.id);
    if (ids.length === 0) return { routes: [], total_in_hand: 0 };

    const [{ data: payments }, { data: expenses }, { data: settlements }] = await Promise.all([
      context.supabase
        .from("delivery_payments")
        .select("route_id, method_name, amount")
        .in("route_id", ids),
      context.supabase.from("route_cash_expenses").select("*").in("route_id", ids),
      context.supabase.from("route_settlements").select("*").in("route_id", ids),
    ]);

    const rows = mine.map((r: any) => {
      const ps = (payments ?? []).filter((p: any) => p.route_id === r.id);
      const es = (expenses ?? []).filter((e: any) => e.route_id === r.id);
      const st = (settlements ?? []).find((s: any) => s.route_id === r.id) ?? null;
      const cashIn = round2(
        ps.filter((p: any) => isCash(p.method_name)).reduce((a, p: any) => a + Number(p.amount), 0),
      );
      const expTotal = round2(
        es.filter((e: any) => e.status !== "rejeitada").reduce((a, e: any) => a + Number(e.amount), 0),
      );
      const byMethod = new Map<string, number>();
      for (const p of ps) {
        byMethod.set(p.method_name, round2((byMethod.get(p.method_name) ?? 0) + Number(p.amount)));
      }
      const confirmed = new Map<string, boolean>(
        ((st?.methods as any[]) ?? []).map((m: any) => [m.method_name, !!m.confirmed]),
      );
      return {
        ...r,
        settlement: st,
        expenses_count: es.length,
        pending_expenses: es.filter((e: any) => e.status === "pendente").length,
        cash_in: cashIn,
        expenses_total: expTotal,
        in_hand: round2(cashIn - expTotal),
        other_methods: Array.from(byMethod, ([method_name, amount]) => ({ method_name, amount }))
          .filter((m) => !isCash(m.method_name))
          .map((m) => ({ ...m, confirmed: confirmed.get(m.method_name) ?? false })),
      };
    });

    return {
      routes: rows,
      total_in_hand: round2(
        rows.filter((r) => !r.settlement || r.settlement.status === "aberta").reduce((a, r) => a + r.in_hand, 0),
      ),
    };
  });

/** Previsto (a receber) vs realizado (recebido) de uma nota de encomenda. */
function buildOrderCompare(d: any, routePayments: any[], serviceRequests: any[] = []) {
  const totals = computeDeliveryTotals(d);
  const ps = routePayments.filter((p: any) => p.delivery_id === d.id);
  const realized = round2(ps.reduce((a: number, p: any) => a + Number(p.amount), 0));
  const byMethod = new Map<string, number>();
  for (const p of ps) {
    byMethod.set(p.method_name, round2((byMethod.get(p.method_name) ?? 0) + Number(p.amount)));
  }
  // O previsto é o valor a receber na rota ANTES dos recebimentos registados:
  // paid_value já inclui os pagamentos da rota, por isso somamos o realizado de volta.
  const forecast = round2(Math.max(totals.totalValue - (totals.paidValue - realized), 0));
  return {
    id: d.id,
    order_number: d.order_number,
    customer_name: d.customer_name,
    status: d.status,
    outcome: d.outcome,
    total_value: round2(totals.totalValue),
    forecast,
    realized,
    diff: round2(realized - forecast),
    methods: Array.from(byMethod, ([method_name, amount]) => ({ method_name, amount })),
    payments: ps.map((p: any) => ({
      id: p.id,
      method_name: p.method_name,
      amount: Number(p.amount),
      received_by_name: p.received_by_name ?? null,
      created_at: p.created_at,
      confirmed: !!p.confirmed,
      confirmed_at: p.confirmed_at ?? null,
    })),
    pending_confirmations: ps.filter((p: any) => !p.confirmed).length,
  };
}

async function assertManager(ctx: any) {
  const list = await roles(ctx);
  if (!list.includes("admin") && !list.includes("logistico")) {
    throw new Error("Sem permissão para ver a caixa global");
  }
}

/** Agrega rotas + pagamentos + despesas + envelopes num período. */
async function loadOperation(ctx: any, days: number) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data: routes, error } = await ctx.supabase
    .from("routes")
    .select("id, zone, route_date, driver, assistant, status, color")
    .gte("route_date", from)
    .order("route_date", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (routes ?? []).map((r: any) => r.id);
  if (ids.length === 0) return { routes: [], payments: [], expenses: [], settlements: [] };

  const [{ data: payments }, { data: expenses }, { data: settlements }] = await Promise.all([
    ctx.supabase
      .from("delivery_payments")
      .select("id, route_id, delivery_id, method_name, amount, received_by_name, created_at, confirmed, confirmed_at")
      .in("route_id", ids),
    ctx.supabase.from("route_cash_expenses").select("*").in("route_id", ids),
    ctx.supabase.from("route_settlements").select("*").in("route_id", ids),
  ]);
  return {
    routes: routes ?? [],
    payments: payments ?? [],
    expenses: expenses ?? [],
    settlements: settlements ?? [],
  };
}

function routeCash(r: any, payments: any[], expenses: any[], settlements: any[]) {
  const ps = payments.filter((p: any) => p.route_id === r.id);
  const es = expenses.filter((e: any) => e.route_id === r.id);
  const st = settlements.find((s: any) => s.route_id === r.id) ?? null;
  const cashIn = round2(
    ps.filter((p: any) => isCash(p.method_name)).reduce((a: number, p: any) => a + Number(p.amount), 0),
  );
  const expTotal = round2(
    es.filter((e: any) => e.status !== "rejeitada").reduce((a: number, e: any) => a + Number(e.amount), 0),
  );
  const byMethod = new Map<string, number>();
  for (const p of ps) {
    byMethod.set(p.method_name, round2((byMethod.get(p.method_name) ?? 0) + Number(p.amount)));
  }
  const confirmed = new Map<string, boolean>(
    ((st?.methods as any[]) ?? []).map((m: any) => [m.method_name, !!m.confirmed]),
  );
  return {
    route: r,
    settlement: st,
    payments: ps,
    expenses: es,
    cash_in: cashIn,
    expenses_total: expTotal,
    in_hand: round2(cashIn - expTotal),
    total_received: round2(ps.reduce((a: number, p: any) => a + Number(p.amount), 0)),
    other_methods: Array.from(byMethod, ([method_name, amount]) => ({ method_name, amount }))
      .filter((m) => !isCash(m.method_name))
      .map((m) => ({ ...m, confirmed: confirmed.get(m.method_name) ?? false })),
  };
}

/** Admin/logística: caixa de todos os funcionários de entrega. */
export const getAllCashByStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(180).optional() }).default({}).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const days = data.days ?? 45;
    const { routes, payments, expenses, settlements } = await loadOperation(context, days);

    type Bucket = {
      name: string;
      in_hand: number;
      cash_in: number;
      expenses_total: number;
      open_routes: number;
      pending_expenses: number;
      routes: any[];
    };
    const buckets = new Map<string, Bucket>();

    for (const r of routes) {
      const c = routeCash(r, payments, expenses, settlements);
      const isOpen = !c.settlement || c.settlement.status === "aberta";
      const people = [r.driver, r.assistant].filter(Boolean) as string[];
      const label = people.length > 0 ? people.join(" · ") : "Sem responsável";
      const key = norm(label);
      const b =
        buckets.get(key) ??
        ({
          name: label,
          in_hand: 0,
          cash_in: 0,
          expenses_total: 0,
          open_routes: 0,
          pending_expenses: 0,
          routes: [],
        } as Bucket);
      b.cash_in = round2(b.cash_in + c.cash_in);
      b.expenses_total = round2(b.expenses_total + c.expenses_total);
      if (isOpen) {
        b.in_hand = round2(b.in_hand + c.in_hand);
        b.open_routes += 1;
      }
      b.pending_expenses += c.expenses.filter((e: any) => e.status === "pendente").length;
      b.routes.push({
        ...r,
        settlement: c.settlement,
        cash_in: c.cash_in,
        expenses_total: c.expenses_total,
        in_hand: c.in_hand,
        total_received: c.total_received,
        other_methods: c.other_methods,
        is_open: isOpen,
        entries: c.payments.map((p: any) => ({
          id: p.id,
          method_name: p.method_name,
          amount: Number(p.amount),
          received_by_name: p.received_by_name,
          created_at: p.created_at,
        })),
        exits: c.expenses.map((e: any) => ({
          id: e.id,
          category: e.category,
          amount: Number(e.amount),
          description: e.description,
          status: e.status,
          created_by_name: e.created_by_name,
          created_at: e.created_at,
          receipt_path: e.receipt_path,
        })),
      });
      buckets.set(key, b);
    }

    const staffRows = Array.from(buckets.values()).sort((a, b) => b.in_hand - a.in_hand);
    return {
      days,
      staff: staffRows,
      total_in_hand: round2(staffRows.reduce((a, s) => a + s.in_hand, 0)),
      total_cash_in: round2(staffRows.reduce((a, s) => a + s.cash_in, 0)),
      total_expenses: round2(staffRows.reduce((a, s) => a + s.expenses_total, 0)),
      pending_expenses: staffRows.reduce((a, s) => a + s.pending_expenses, 0),
    };
  });

/** Admin/logística: todos os envelopes com responsáveis, saídas e previsto/realizado. */
export const getAllSettlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).optional() }).default({}).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const days = data.days ?? 60;
    const { routes, payments, expenses, settlements } = await loadOperation(context, days);
    const withEnvelope = routes.filter((r: any) =>
      settlements.some((s: any) => s.route_id === r.id && s.status !== "aberta"),
    );
    const ids = withEnvelope.map((r: any) => r.id);

    let deliveries: any[] = [];
    if (ids.length > 0) {
      const { data: ds } = await context.supabase
        .from("scheduled_deliveries")
        .select(
          "id, route_id, order_number, customer_name, status, outcome, total_value, paid_value, remaining_value, order_payload",
        )
        .in("route_id", ids)
        .order("order_number", { ascending: true });
      deliveries = ds ?? [];
    }

    const rows = withEnvelope.map((r: any) => {
      const c = routeCash(r, payments, expenses, settlements);
      const ps = c.payments;
      const orders = deliveries
        .filter((d: any) => d.route_id === r.id)
        .map((d: any) => buildOrderCompare(d, ps));
      return {
        ...r,
        settlement: c.settlement,
        cash_in: c.cash_in,
        expenses_total: c.expenses_total,
        in_hand: c.in_hand,
        total_received: c.total_received,
        other_methods: c.other_methods,
        orders_count: orders.length,
        forecast_total: round2(orders.reduce((a: number, o: any) => a + o.forecast, 0)),
        realized_total: round2(orders.reduce((a: number, o: any) => a + o.realized, 0)),
        exits: c.expenses.map((e: any) => ({
          id: e.id,
          category: e.category,
          amount: Number(e.amount),
          description: e.description,
          status: e.status,
          created_by_name: e.created_by_name,
          created_at: e.created_at,
        })),
      };
    });

    return {
      days,
      settlements: rows,
      pending_total: round2(
        rows
          .filter((r: any) => r.settlement?.status === "entregue")
          .reduce((a: number, r: any) => a + Number(r.settlement.cash_declared), 0),
      ),
      pending_count: rows.filter((r: any) => r.settlement?.status === "entregue").length,
    };
  });
