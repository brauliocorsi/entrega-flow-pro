import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

async function myStaffNames(ctx: any): Promise<string[]> {
  const { data } = await ctx.supabase
    .from("staff")
    .select("name, active")
    .eq("user_id", ctx.userId);
  return (data ?? []).filter((s: any) => s.active).map((s: any) => norm(s.name));
}

async function displayName(ctx: any): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data?.display_name ?? data?.email ?? null;
}

async function assertCanTouchRoute(ctx: any, routeId: string) {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const list = (roles ?? []).map((r: any) => r.role);
  if (list.includes("admin") || list.includes("logistico")) return;

  const names = await myStaffNames(ctx);
  const { data: route } = await ctx.supabase
    .from("routes")
    .select("driver, assistant")
    .eq("id", routeId)
    .maybeSingle();
  if (!route) throw new Error("Rota não encontrada");
  if (!names.includes(norm(route.driver)) && !names.includes(norm(route.assistant))) {
    throw new Error("Não estás escalado nesta rota");
  }
}

async function assertRouteOpen(ctx: any, routeId: string) {
  const { data: route } = await ctx.supabase
    .from("routes")
    .select("status")
    .eq("id", routeId)
    .maybeSingle();
  if (route?.status === "concluida") {
    throw new Error("A rota já foi fechada — fala com o administrador para reabrir");
  }
}

/** Rotas do dia onde o utilizador está escalado (motorista ou auxiliar). */
export const getMyDay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const date = data.date ?? todayISO();
    const names = await myStaffNames(context);

    const { data: routes, error } = await context.supabase
      .from("routes")
      .select("*")
      .eq("route_date", date);
    if (error) throw new Error(error.message);

    const mine = (routes ?? []).filter(
      (r: any) => names.includes(norm(r.driver)) || names.includes(norm(r.assistant)),
    );
    if (mine.length === 0) return { date, hasStaffProfile: names.length > 0, routes: [] };

    const ids = mine.map((r: any) => r.id);
    const { data: deliveries, error: dErr } = await context.supabase
      .from("scheduled_deliveries")
      .select("*")
      .in("route_id", ids)
      .order("created_at", { ascending: true });
    if (dErr) throw new Error(dErr.message);

    const { data: payments } = await context.supabase
      .from("delivery_payments")
      .select("*")
      .in("route_id", ids)
      .order("created_at", { ascending: true });

    return {
      date,
      hasStaffProfile: names.length > 0,
      routes: mine.map((r: any) => ({
        ...r,
        deliveries: (deliveries ?? []).filter((d: any) => d.route_id === r.id),
        payments: (payments ?? []).filter((p: any) => p.route_id === r.id),
      })),
    };
  });

/** Detalhe de uma entrega (para o ecrã do entregador). */
export const getCourierDelivery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deliveryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: delivery, error } = await context.supabase
      .from("scheduled_deliveries")
      .select("*")
      .eq("id", data.deliveryId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!delivery) throw new Error("Entrega não encontrada");

    const { data: route } = await context.supabase
      .from("routes")
      .select("*")
      .eq("id", delivery.route_id)
      .maybeSingle();

    const { data: payments } = await context.supabase
      .from("delivery_payments")
      .select("*")
      .eq("delivery_id", delivery.id)
      .order("created_at", { ascending: true });

    const { data: services } = await context.supabase
      .from("service_requests")
      .select("*")
      .eq("delivery_id", delivery.id)
      .order("created_at", { ascending: true });

    return { delivery, route, payments: payments ?? [], services: services ?? [] };
  });

/** Registar um recebimento (podem existir vários por entrega, com formas diferentes). */
export const addDeliveryPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        delivery_id: z.string().uuid(),
        method_id: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        notes: z.string().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: delivery, error } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, route_id")
      .eq("id", data.delivery_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!delivery) throw new Error("Entrega não encontrada");

    await assertCanTouchRoute(context, delivery.route_id);
    await assertRouteOpen(context, delivery.route_id);

    const { data: method } = await context.supabase
      .from("payment_methods")
      .select("id, name, active")
      .eq("id", data.method_id)
      .maybeSingle();
    if (!method || !method.active) throw new Error("Forma de pagamento inválida");

    const { error: insErr } = await context.supabase.from("delivery_payments").insert({
      delivery_id: delivery.id,
      route_id: delivery.route_id,
      method_id: method.id,
      method_name: method.name,
      amount: Math.round(data.amount * 100) / 100,
      notes: data.notes?.trim() || null,
      received_by: context.userId,
      received_by_name: await displayName(context),
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

export const deleteDeliveryPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("delivery_payments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RESULTS = ["entregue", "parcial", "nao_entregue", "cancelado", "reagendado"] as const;

/** Confirmar o resultado da entrega no terreno. */
export const setDeliveryResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        delivery_id: z.string().uuid(),
        result: z.enum(RESULTS),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: delivery, error } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, route_id")
      .eq("id", data.delivery_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!delivery) throw new Error("Entrega não encontrada");
    await assertCanTouchRoute(context, delivery.route_id);
    await assertRouteOpen(context, delivery.route_id);

    const map: Record<
      (typeof RESULTS)[number],
      { outcome: "entregue" | "nao_entregue" | "entregue_parcial"; status: string }
    > = {
      entregue: { outcome: "entregue", status: "entregue" },
      parcial: { outcome: "entregue_parcial", status: "entregue" },
      nao_entregue: { outcome: "nao_entregue", status: "reagendado" },
      cancelado: { outcome: "nao_entregue", status: "cancelado" },
      reagendado: { outcome: "nao_entregue", status: "reagendado" },
    };
    const target = map[data.result];

    const { error: upErr } = await context.supabase
      .from("scheduled_deliveries")
      .update({
        outcome: target.outcome,
        outcome_notes: data.notes?.trim() || null,
        outcome_at: new Date().toISOString(),
        status: target.status as any,
      })
      .eq("id", delivery.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, queued: target.status === "reagendado" };
  });

/** Abrir assistência para um produto com defeito. */
export const openServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        delivery_id: z.string().uuid(),
        product_name: z.string().min(1).max(200),
        description: z.string().min(3).max(1000),
        photos: z.array(z.string().max(400)).max(8).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: delivery, error } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, route_id, order_number, customer_name")
      .eq("id", data.delivery_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!delivery) throw new Error("Entrega não encontrada");
    await assertCanTouchRoute(context, delivery.route_id);

    const { error: insErr } = await context.supabase.from("service_requests").insert({
      delivery_id: delivery.id,
      route_id: delivery.route_id,
      order_number: delivery.order_number,
      customer_name: delivery.customer_name,
      product_name: data.product_name.trim(),
      description: data.description.trim(),
      photos: data.photos,
      opened_by: context.userId,
      opened_by_name: await displayName(context),
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

/** Fecho de caixa: previsto vs recebido por rota/forma/entregador numa data. */
export const getCashSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const date = data.date ?? todayISO();
    const { data: routes, error } = await context.supabase
      .from("routes")
      .select("id, zone, driver, assistant, route_date, status, color")
      .eq("route_date", date)
      .order("zone", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (routes ?? []).map((r: any) => r.id);
    if (ids.length === 0) return { date, routes: [] };

    const { data: deliveries } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, route_id, total_value, paid_value, remaining_value, status, outcome")
      .in("route_id", ids);

    const { data: payments } = await context.supabase
      .from("delivery_payments")
      .select("route_id, method_name, amount, received_by_name")
      .in("route_id", ids);

    return {
      date,
      routes: (routes ?? []).map((r: any) => {
        const ds = (deliveries ?? []).filter((d: any) => d.route_id === r.id);
        const ps = (payments ?? []).filter((p: any) => p.route_id === r.id);
        const byMethod = new Map<string, number>();
        const byCourier = new Map<string, number>();
        for (const p of ps) {
          byMethod.set(p.method_name, (byMethod.get(p.method_name) ?? 0) + Number(p.amount));
          const who = p.received_by_name ?? "—";
          byCourier.set(who, (byCourier.get(who) ?? 0) + Number(p.amount));
        }
        const active = ds.filter((d: any) => d.status !== "cancelado");
        return {
          ...r,
          deliveries_total: active.length,
          delivered: active.filter((d: any) => d.status === "entregue").length,
          forecast: active.reduce((a: number, d: any) => a + Number(d.total_value ?? 0), 0),
          received: ps.reduce((a: number, p: any) => a + Number(p.amount), 0),
          by_method: Array.from(byMethod, ([name, amount]) => ({ name, amount })),
          by_courier: Array.from(byCourier, ([name, amount]) => ({ name, amount })),
        };
      }),
    };
  });
