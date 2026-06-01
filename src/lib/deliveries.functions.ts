import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { updateGestaoClickVendaSchedule, fetchOrder } from "./gestaoclick.functions";

const ScheduleInput = z.object({
  route_id: z.string().uuid(),
  order_number: z.string().min(1).max(40),
  gestaoclick_id: z.string().max(40).nullable().optional(),
  customer_name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  zip_code: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  total_value: z.number().min(0),
  paid_value: z.number().min(0),
  volume_m3: z.number().min(0).max(100),
  delivery_type: z.enum(["entrega", "levantamento", "recolha", "troca"]),
  estimated_minutes: z.number().int().min(5).max(480),
  notes: z.string().max(1000).nullable().optional(),
  rescheduled_from_id: z.string().uuid().nullable().optional(),
  order_payload: z.any().nullable().optional(),
});

export const scheduleDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScheduleInput.parse(d))
  .handler(async ({ data, context }) => {
    // double-check no active duplicate
    const { data: dup } = await context.supabase
      .from("scheduled_deliveries")
      .select("id")
      .eq("order_number", data.order_number)
      .in("status", ["agendado", "confirmado"])
      .maybeSingle();
    if (dup) throw new Error(`A encomenda ${data.order_number} já está agendada noutra rota.`);

    // capacity check
    const { data: route } = await context.supabase
      .from("routes")
      .select("id, max_capacity_m3, current_volume_m3, status")
      .eq("id", data.route_id)
      .maybeSingle();
    if (!route) throw new Error("Rota não encontrada");
    if (["fechada", "concluida"].includes(route.status)) throw new Error("Esta rota já está fechada");
    if (Number(route.current_volume_m3) + data.volume_m3 > Number(route.max_capacity_m3) + 0.001) {
      throw new Error(
        `Capacidade insuficiente. Restam ${(Number(route.max_capacity_m3) - Number(route.current_volume_m3)).toFixed(2)} m³`,
      );
    }

    // seller name
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: inserted, error } = await context.supabase
      .from("scheduled_deliveries")
      .insert({
        route_id: data.route_id,
        order_number: data.order_number,
        customer_name: data.customer_name,
        address: data.address,
        zip_code: data.zip_code ?? null,
        city: data.city ?? null,
        phone: data.phone ?? null,
        total_value: data.total_value,
        paid_value: data.paid_value,
        volume_m3: data.volume_m3,
        delivery_type: data.delivery_type,
        estimated_minutes: data.estimated_minutes,
        notes: data.notes ?? null,
        rescheduled_from_id: data.rescheduled_from_id ?? null,
        order_payload: data.order_payload ?? null,
        seller_id: context.userId,
        seller_name: profile?.display_name ?? profile?.email ?? null,
        status: "agendado",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Best-effort: atualizar GestãoClick com data prevista + status "Agendado Entrega"
    let gcUpdate: { ok: boolean; error?: string } = { ok: false };
    if (data.gestaoclick_id) {
      const { data: routeRow } = await context.supabase
        .from("routes")
        .select("route_date")
        .eq("id", data.route_id)
        .maybeSingle();
      if (routeRow?.route_date) {
        gcUpdate = await updateGestaoClickVendaSchedule({
          vendaId: data.gestaoclick_id,
          routeDate: routeRow.route_date,
          statusLabel: "Agendado Entrega",
        });
        if (!gcUpdate.ok) {
          console.warn("[scheduleDelivery] GestãoClick update falhou:", gcUpdate.error);
        }
      }
    }
    return { id: inserted.id, gestaoclick_synced: gcUpdate.ok, gestaoclick_error: gcUpdate.error ?? null };
  });

export const cancelDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scheduled_deliveries")
      .update({ status: "cancelado" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDeliveryMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        volume_m3: z.number().min(0).max(100),
        estimated_minutes: z.number().int().min(5).max(480),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: current, error: cErr } = await context.supabase
      .from("scheduled_deliveries")
      .select("route_id, volume_m3, estimated_minutes")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!current) throw new Error("Entrega não encontrada");

    const { data: route } = await context.supabase
      .from("routes")
      .select("max_capacity_m3, max_minutes, status")
      .eq("id", current.route_id)
      .maybeSingle();
    if (!route) throw new Error("Rota não encontrada");
    if (["fechada", "concluida"].includes(route.status as string))
      throw new Error("Esta rota já está fechada");

    const { data: siblings } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, volume_m3, estimated_minutes, status")
      .eq("route_id", current.route_id);

    const others = (siblings ?? []).filter(
      (s) => s.id !== data.id && !["cancelado", "reagendado"].includes(s.status as string),
    );
    const newVol = others.reduce((a, s) => a + Number(s.volume_m3), 0) + data.volume_m3;
    const newMin = others.reduce((a, s) => a + Number(s.estimated_minutes), 0) + data.estimated_minutes;

    if (newVol > Number(route.max_capacity_m3) + 0.001) {
      throw new Error(
        `Capacidade de volume excedida: ${newVol.toFixed(2)} m³ / ${Number(route.max_capacity_m3).toFixed(2)} m³`,
      );
    }
    if (newMin > Number(route.max_minutes)) {
      throw new Error(
        `Tempo total excedido: ${newMin} min / ${route.max_minutes} min`,
      );
    }

    const { error } = await context.supabase
      .from("scheduled_deliveries")
      .update({ volume_m3: data.volume_m3, estimated_minutes: data.estimated_minutes })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, total_volume_m3: newVol, total_minutes: newMin };
  });

export const refreshDeliveryPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, order_number")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Entrega não encontrada");

    const res = await fetchOrder({ data: { orderNumber: row.order_number } });
    if (!res.order) throw new Error(res.error ?? "Encomenda não encontrada no GestãoClick");

    const o = res.order;
    const payload = {
      items: o.items ?? [],
      has_assembly: o.has_assembly ?? false,
      has_delivery_service: o.has_delivery_service ?? false,
      observations: o.observations ?? null,
      status: o.status ?? null,
      date: o.date ?? null,
    };
    const { error: uErr } = await context.supabase
      .from("scheduled_deliveries")
      .update({ order_payload: payload as any })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, items: payload.items.length };
  });

const CloseRouteInput = z.object({
  routeId: z.string().uuid(),
  outcomes: z.array(
    z.object({
      delivery_id: z.string().uuid(),
      outcome: z.enum(["entregue", "nao_entregue", "entregue_parcial"]),
      outcome_notes: z.string().max(500).nullable().optional(),
    }),
  ),
});

export const closeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CloseRouteInput.parse(d))
  .handler(async ({ data, context }) => {
    for (const o of data.outcomes) {
      // entregue → status entregue; restantes mantêm-se como histórico mas marcam outcome
      const status = o.outcome === "entregue" ? "entregue" : "entregue";
      const { error } = await context.supabase
        .from("scheduled_deliveries")
        .update({
          outcome: o.outcome,
          outcome_notes: o.outcome_notes ?? null,
          outcome_at: new Date().toISOString(),
          status,
        })
        .eq("id", o.delivery_id);
      if (error) throw new Error(error.message);
    }
    const { error: rErr } = await context.supabase
      .from("routes")
      .update({ status: "concluida" })
      .eq("id", data.routeId);
    if (rErr) throw new Error(rErr.message);
    return { ok: true };
  });

export const listPendingReschedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, order_number, customer_name, outcome, outcome_notes, route_id, routes:route_id(route_date, zone)")
      .in("outcome", ["nao_entregue", "entregue_parcial"])
      .order("outcome_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    // filter out ones already rescheduled to a new active delivery
    if (!data || data.length === 0) return [];
    const ids = data.map((d) => d.id);
    const { data: refs } = await context.supabase
      .from("scheduled_deliveries")
      .select("rescheduled_from_id")
      .in("rescheduled_from_id", ids);
    const reused = new Set((refs ?? []).map((r) => r.rescheduled_from_id));
    return data.filter((d) => !reused.has(d.id));
  });
