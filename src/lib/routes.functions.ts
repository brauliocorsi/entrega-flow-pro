import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .default({})
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("routes")
      .select("*")
      .order("route_date", { ascending: true });
    if (data.from) q = q.gte("route_date", data.from);
    if (data.to) q = q.lte("route_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const routes = rows ?? [];
    if (routes.length === 0) return [];

    const ids = routes.map((r) => r.id);
    const { data: deliveries } = await context.supabase
      .from("scheduled_deliveries")
      .select("route_id, estimated_minutes, volume_m3, notes, delivery_type, status")
      .in("route_id", ids)
      .in("status", ["agendado", "confirmado", "entregue"]);

    const stats = new Map<string, { minutes: number; assembly: number; deliveries: number }>();
    for (const d of deliveries ?? []) {
      const s = stats.get(d.route_id) ?? { minutes: 0, assembly: 0, deliveries: 0 };
      s.minutes += Number(d.estimated_minutes ?? 0);
      s.deliveries += 1;
      if (d.notes && /montagem|montar|instala/i.test(d.notes)) s.assembly += 1;
      stats.set(d.route_id, s);
    }

    return routes.map((r) => ({
      ...r,
      total_minutes: stats.get(r.id)?.minutes ?? 0,
      assembly_count: stats.get(r.id)?.assembly ?? 0,
    }));
  });

export const getRouteWithDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: route, error } = await context.supabase
      .from("routes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!route) throw new Error("Rota não encontrada");

    const { data: deliveries, error: dErr } = await context.supabase
      .from("scheduled_deliveries")
      .select("*")
      .eq("route_id", data.id)
      .order("created_at", { ascending: true });
    if (dErr) throw new Error(dErr.message);

    return { route, deliveries: deliveries ?? [] };
  });

export const updateRouteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["disponivel", "quase_cheia", "cheia", "fechada", "concluida"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleData } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) throw new Error("Apenas administradores podem alterar o estado da rota");
    const { error } = await context.supabase
      .from("routes")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
