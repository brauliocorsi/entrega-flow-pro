import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeForecastForDelivery, type ForecastItem } from "./forecasts.shared";
import { fetchOrderDtoFromGestaoClick } from "./gestaoclick-core.server";

async function assertAdminOrLogistico(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("logistico")) {
    throw new Error("Apenas administradores ou logísticos podem gerar previsões.");
  }
}

export interface RouteForecast {
  id: string;
  route_id: string;
  generated_by: string;
  generated_by_name: string | null;
  total_orders: number;
  total_gross: number;
  total_services: number;
  total_forecast: number;
  items: ForecastItem[];
  route_snapshot: any;
  created_at: string;
}

// Processa em lotes para não saturar a API do GestãoClick
async function inBatches<T, R>(
  arr: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < arr.length; i += size) {
    const chunk = arr.slice(i, i + size);
    const res = await Promise.all(chunk.map(fn));
    out.push(...res);
  }
  return out;
}

export const generateRouteForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ routeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RouteForecast> => {
    const { supabase, userId } = context;
    await assertAdminOrLogistico(supabase, userId);

    const { data: route, error: routeErr } = await supabase
      .from("routes")
      .select("id, route_date, zone, driver, vehicle, assistant, zip_prefixes")
      .eq("id", data.routeId)
      .maybeSingle();
    if (routeErr || !route) throw new Error("Rota não encontrada.");

    const { data: deliveriesRaw, error: delErr } = await supabase
      .from("scheduled_deliveries")
      .select("id, order_number, customer_name, total_value, paid_value, remaining_value, order_payload, status")
      .eq("route_id", data.routeId)
      .not("status", "in", "(cancelado,reagendado)");
    if (delErr) throw new Error(delErr.message);

    const deliveries = deliveriesRaw ?? [];

    // ---- Sincronizar valores frescos do GestãoClick (em lotes de 4) ----
    const syncErrors: { order_number: string; error: string }[] = [];
    let syncedCount = 0;

    const refreshed = await inBatches(deliveries, 4, async (d: any) => {
      const { dto, error } = await fetchOrderDtoFromGestaoClick(d.order_number);
      if (!dto) {
        if (error) syncErrors.push({ order_number: d.order_number, error });
        return d; // mantém valores antigos
      }
      // Atualiza BD com valores frescos do GC
      const paid = Math.max(dto.total_value - dto.remaining_value, 0);
      const { error: updErr } = await supabase
        .from("scheduled_deliveries")
        .update({
          order_payload: dto as any,
          total_value: dto.total_value,
          paid_value: paid,
        })
        .eq("id", d.id);
      if (updErr) {
        syncErrors.push({ order_number: d.order_number, error: updErr.message });
        return d;
      }
      syncedCount += 1;
      return {
        ...d,
        order_payload: dto,
        total_value: dto.total_value,
        paid_value: paid,
        remaining_value: dto.remaining_value,
      };
    });

    const items: ForecastItem[] = refreshed.map(computeForecastForDelivery);

    const total_gross = items.reduce((a, i) => a + i.total_value, 0);
    const total_services = items.reduce((a, i) => a + i.services_value, 0);
    const total_forecast = items.reduce((a, i) => a + i.forecast_value, 0);

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    const generated_by_name = profile?.display_name ?? profile?.email ?? null;

    const route_snapshot = {
      ...route,
      synced_count: syncedCount,
      sync_errors: syncErrors,
      synced_at: new Date().toISOString(),
    };

    const { data: inserted, error: insErr } = await supabase
      .from("route_payment_forecasts")
      .insert({
        route_id: data.routeId,
        generated_by: userId,
        generated_by_name,
        total_orders: items.length,
        total_gross,
        total_services,
        total_forecast,
        items: items as any,
        route_snapshot: route_snapshot as any,
      })
      .select("*")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Falha ao guardar previsão.");

    return inserted as unknown as RouteForecast;
  });

export const listRouteForecasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ routeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RouteForecast[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("route_payment_forecasts")
      .select("*")
      .eq("route_id", data.routeId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as RouteForecast[];
  });

export const getRouteForecast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RouteForecast> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("route_payment_forecasts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Previsão não encontrada.");
    return row as unknown as RouteForecast;
  });
