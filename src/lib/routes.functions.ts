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
    return rows ?? [];
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
