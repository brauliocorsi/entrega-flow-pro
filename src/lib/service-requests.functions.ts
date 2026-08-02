import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUSES = ["aberta", "em_curso", "resolvida"] as const;

export const listServiceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ status: z.enum([...STATUSES, "todas"]).default("todas") })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("service_requests")
      .select("*, routes:route_id(route_date, zone)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "todas") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(STATUSES),
        resolution_notes: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("service_requests")
      .update({
        status: data.status,
        resolution_notes: data.resolution_notes?.trim() || null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: row } = await context.supabase
      .from("service_requests")
      .select("gc_os_id")
      .eq("id", data.id)
      .maybeSingle();

    let gcSync: { ok: boolean; error?: string } | null = null;
    if (row?.gc_os_id) {
      const { pushToGestaoClick } = await import("@/lib/service-orders.server");
      try {
        await pushToGestaoClick(context.supabase, data.id, "update");
        gcSync = { ok: true };
      } catch (e) {
        gcSync = { ok: false, error: e instanceof Error ? e.message : "Erro" };
      }
    }
    return { ok: true, gcSync };
  });

export const openServiceOrderInGC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin, loadRequest, pushToGestaoClick } = await import(
      "@/lib/service-orders.server"
    );
    await assertAdmin(context.supabase, context.userId);
    const row = await loadRequest(context.supabase, data.id);
    const already = Boolean(row.gc_os_id);
    const result = await pushToGestaoClick(
      context.supabase,
      data.id,
      already ? "update" : "create",
    );
    return { ...result, already };
  });

export const syncServiceOrderInGC = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertAdmin, loadRequest, pushToGestaoClick } = await import(
      "@/lib/service-orders.server"
    );
    await assertAdmin(context.supabase, context.userId);
    const row = await loadRequest(context.supabase, data.id);
    if (!row.gc_os_id) throw new Error("Esta assistência ainda não tem OS no GestãoClick");
    return await pushToGestaoClick(context.supabase, data.id, "update");
  });

/** Dados do cliente/morada para pré-preencher o agendamento da assistência. */
export const getServiceRequestScheduleDraft = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sr, error } = await context.supabase
      .from("service_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sr) throw new Error("Assistência não encontrada");

    let delivery: any = null;
    if (sr.delivery_id) {
      const { data: d } = await context.supabase
        .from("scheduled_deliveries")
        .select("address, zip_code, city, phone, customer_name, order_number")
        .eq("id", sr.delivery_id)
        .maybeSingle();
      delivery = d ?? null;
    }
    if (!delivery && sr.order_number) {
      const { data: d } = await context.supabase
        .from("scheduled_deliveries")
        .select("address, zip_code, city, phone, customer_name, order_number")
        .eq("order_number", sr.order_number)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      delivery = d ?? null;
    }

    return {
      request: sr,
      address: delivery?.address ?? "",
      zip_code: delivery?.zip_code ?? null,
      city: delivery?.city ?? null,
      phone: delivery?.phone ?? null,
      customer_name: sr.customer_name ?? delivery?.customer_name ?? "",
    };
  });

const ScheduleServiceInput = z.object({
  id: z.string().uuid(),
  route_id: z.string().uuid(),
  delivery_type: z.enum(["recolha", "troca", "entrega", "levantamento"]).default("recolha"),
  address: z.string().min(1).max(500),
  zip_code: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  charge_value: z.number().min(0).max(1000000).default(0),
  volume_m3: z.number().min(0).max(100).default(0),
  estimated_minutes: z.number().int().min(5).max(480).default(20),
  extra_notes: z.string().max(1000).nullable().optional(),
});

/** Agenda uma assistência numa rota, criando uma paragem com toda a descrição. */
export const scheduleServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScheduleServiceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: sr, error: srErr } = await context.supabase
      .from("service_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (srErr) throw new Error(srErr.message);
    if (!sr) throw new Error("Assistência não encontrada");
    if (sr.scheduled_delivery_id) {
      const { data: existing } = await context.supabase
        .from("scheduled_deliveries")
        .select("id, status, route_id")
        .eq("id", sr.scheduled_delivery_id)
        .maybeSingle();
      if (existing && ["agendado", "confirmado"].includes(existing.status)) {
        throw new Error("Esta assistência já está agendada numa rota.");
      }
    }

    const { data: route } = await context.supabase
      .from("routes")
      .select("id, route_date, zone, status, max_capacity_m3, current_volume_m3")
      .eq("id", data.route_id)
      .maybeSingle();
    if (!route) throw new Error("Rota não encontrada");
    if (["fechada", "concluida"].includes(route.status))
      throw new Error("Esta rota já está fechada");
    if (
      Number(route.current_volume_m3) + data.volume_m3 >
      Number(route.max_capacity_m3) + 0.001
    ) {
      throw new Error("Capacidade insuficiente nesta rota");
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();

    const photos = Array.isArray(sr.photos) ? sr.photos.length : 0;
    const noteLines = [
      "ASSISTÊNCIA TÉCNICA",
      `Encomenda de origem: #${sr.order_number}`,
      `Produto: ${sr.product_name}`,
      `Ocorrência: ${sr.description}`,
      sr.opened_by_name ? `Reportada por: ${sr.opened_by_name}` : null,
      sr.resolution_notes ? `Notas de resolução (ADM): ${sr.resolution_notes}` : null,
      sr.gc_os_number || sr.gc_os_id
        ? `OS GestãoClick: ${sr.gc_os_number ?? sr.gc_os_id}`
        : null,
      photos > 0 ? `${photos} foto(s) anexada(s) na assistência` : null,
      data.charge_value > 0
        ? `A RECEBER NO LOCAL: ${data.charge_value.toFixed(2)} €`
        : "Sem valor a receber",
      data.extra_notes?.trim() ? `Notas: ${data.extra_notes.trim()}` : null,
    ].filter(Boolean);

    const { data: inserted, error } = await context.supabase
      .from("scheduled_deliveries")
      .insert({
        route_id: data.route_id,
        order_number: `AS-${sr.order_number}`,
        customer_name: sr.customer_name ?? "Cliente",
        address: data.address,
        zip_code: data.zip_code ?? null,
        city: data.city ?? null,
        phone: data.phone ?? null,
        total_value: data.charge_value,
        paid_value: 0,
        volume_m3: data.volume_m3,
        delivery_type: data.delivery_type,
        estimated_minutes: data.estimated_minutes,
        notes: noteLines.join("\n"),
        seller_id: context.userId,
        seller_name: profile?.display_name ?? profile?.email ?? null,
        status: "agendado",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: upErr } = await context.supabase
      .from("service_requests")
      .update({
        scheduled_delivery_id: inserted.id,
        scheduled_route_id: data.route_id,
        scheduled_date: route.route_date,
        charge_value: data.charge_value,
        status: sr.status === "aberta" ? "em_curso" : sr.status,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return {
      ok: true,
      delivery_id: inserted.id,
      route_date: route.route_date,
      zone: route.zone,
    };
  });

/** Remove o agendamento da assistência (liberta a paragem da rota). */
export const unscheduleServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sr } = await context.supabase
      .from("service_requests")
      .select("scheduled_delivery_id")
      .eq("id", data.id)
      .maybeSingle();
    if (sr?.scheduled_delivery_id) {
      await context.supabase
        .from("scheduled_deliveries")
        .delete()
        .eq("id", sr.scheduled_delivery_id);
    }
    const { error } = await context.supabase
      .from("service_requests")
      .update({ scheduled_delivery_id: null, scheduled_route_id: null, scheduled_date: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
