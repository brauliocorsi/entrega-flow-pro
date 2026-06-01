import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Weekly route optimization analyzer.
 *
 * Strategy (no geocoding): for each delivery in the week, check whether
 * another route in the same week has zip_prefixes that match the delivery's
 * postal code BETTER than the current route. "Better" = the delivery's zip
 * prefix is in the target route's zip_prefixes but NOT in the current
 * route's. Returns one suggestion per delivery that could be relocated.
 */
export const analyzeWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string(), // YYYY-MM-DD
        to: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: routes, error: rErr } = await context.supabase
      .from("routes")
      .select("id, route_date, zone, zip_prefixes, driver, color, status, max_capacity_m3, current_volume_m3")
      .gte("route_date", data.from)
      .lte("route_date", data.to)
      .order("route_date", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    if (!routes || routes.length === 0) {
      return { routes: [], suggestions: [] };
    }

    const ids = routes.map((r) => r.id);
    const { data: deliveries, error: dErr } = await context.supabase
      .from("scheduled_deliveries")
      .select("id, route_id, order_number, customer_name, city, zip_code, volume_m3, status, address")
      .in("route_id", ids)
      .in("status", ["agendado", "confirmado"]);
    if (dErr) throw new Error(dErr.message);

    const routeMap = new Map(routes.map((r) => [r.id, r]));

    type Suggestion = {
      delivery_id: string;
      order_number: string;
      customer_name: string;
      city: string | null;
      zip_code: string | null;
      from_route_id: string;
      from_route_label: string;
      to_route_id: string;
      to_route_label: string;
      reason: string;
      capacity_ok: boolean;
    };

    const suggestions: Suggestion[] = [];

    for (const d of deliveries ?? []) {
      const zip = (d.zip_code ?? "").trim();
      if (!zip) continue;
      const prefix4 = zip.slice(0, 4);
      const current = routeMap.get(d.route_id);
      if (!current) continue;

      const currentPrefixes = (current.zip_prefixes ?? []) as string[];
      const matchesCurrent = currentPrefixes.some((p) => prefix4.startsWith(p));

      // Find better-matching routes in the same week (and ideally close in date).
      const candidates = routes.filter((r) => {
        if (r.id === current.id) return false;
        if (r.status === "fechada" || r.status === "concluida") return false;
        const prefixes = (r.zip_prefixes ?? []) as string[];
        return prefixes.some((p) => prefix4.startsWith(p));
      });
      if (candidates.length === 0) continue;

      // If current route already matches, only suggest if a different route also matches
      // AND is in a nearby date — i.e. consolidation opportunity (same locality scheduled twice).
      if (matchesCurrent) {
        const sameLocalityOtherDate = candidates.find(
          (c) => c.zone === current.zone && c.route_date !== current.route_date,
        );
        if (!sameLocalityOtherDate) continue;
        const remaining =
          Number(sameLocalityOtherDate.max_capacity_m3) -
          Number(sameLocalityOtherDate.current_volume_m3);
        suggestions.push({
          delivery_id: d.id,
          order_number: d.order_number,
          customer_name: d.customer_name,
          city: d.city,
          zip_code: d.zip_code,
          from_route_id: current.id,
          from_route_label: `${current.zone} · ${current.route_date}`,
          to_route_id: sameLocalityOtherDate.id,
          to_route_label: `${sameLocalityOtherDate.zone} · ${sameLocalityOtherDate.route_date}`,
          reason: `Consolidar entregas da mesma zona (${d.city ?? prefix4}) numa só data`,
          capacity_ok: remaining >= Number(d.volume_m3 ?? 0),
        });
        continue;
      }

      // Current route doesn't match — pick the best candidate (prefer same zone first).
      const best =
        candidates.find((c) => c.zone.toLowerCase().includes((d.city ?? "").toLowerCase())) ??
        candidates[0];
      const remaining = Number(best.max_capacity_m3) - Number(best.current_volume_m3);
      suggestions.push({
        delivery_id: d.id,
        order_number: d.order_number,
        customer_name: d.customer_name,
        city: d.city,
        zip_code: d.zip_code,
        from_route_id: current.id,
        from_route_label: `${current.zone} · ${current.route_date}`,
        to_route_id: best.id,
        to_route_label: `${best.zone} · ${best.route_date}`,
        reason: `CP ${prefix4} (${d.city ?? "—"}) corresponde melhor à zona "${best.zone}"`,
        capacity_ok: remaining >= Number(d.volume_m3 ?? 0),
      });
    }

    return {
      routes,
      suggestions,
    };
  });

export const applySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        delivery_id: z.string().uuid(),
        to_route_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: targetRoute } = await context.supabase
      .from("routes")
      .select("route_date")
      .eq("id", data.to_route_id)
      .maybeSingle();
    if (!targetRoute) throw new Error("Rota de destino não encontrada");

    const { error } = await context.supabase
      .from("scheduled_deliveries")
      .update({ route_id: data.to_route_id })
      .eq("id", data.delivery_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
