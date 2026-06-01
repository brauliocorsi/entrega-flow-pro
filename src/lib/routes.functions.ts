import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const routeSimulationInput = z.object({
  origin: z.string().min(5).max(255),
  destination: z.string().min(5).max(255),
  intermediates: z.array(z.string().min(5).max(255)).max(23).default([]),
});

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

export const getRouteSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => routeSimulationInput.parse(d))
  .handler(async ({ data }) => {
    const lovableApiKey = process.env.LOVABLE_API_KEY;
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY em falta para calcular o trajeto");

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) throw new Error("GOOGLE_MAPS_API_KEY em falta para calcular o trajeto");

    const response = await fetch("https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": googleMapsApiKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": [
          "routes.distanceMeters",
          "routes.duration",
          "routes.polyline.encodedPolyline",
          "routes.legs.distanceMeters",
          "routes.legs.duration",
          "routes.legs.startLocation",
          "routes.legs.endLocation",
          "routes.legs.polyline.encodedPolyline",
          "routes.optimizedIntermediateWaypointIndex",
        ].join(","),
      },
      body: JSON.stringify({
        origin: { address: data.origin },
        destination: { address: data.destination },
        intermediates: data.intermediates.map((address) => ({ address })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        polylineQuality: "HIGH_QUALITY",
        optimizeWaypointOrder: true,
        languageCode: "pt-PT",
        units: "METRIC",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha ao calcular trajeto (${response.status}): ${body}`);
    }

    const result = await response.json();
    const route = result?.routes?.[0];

    if (!route?.polyline?.encodedPolyline) {
      throw new Error("O Google Maps não devolveu geometria para este trajeto");
    }

    return {
      distanceMeters: Number(route.distanceMeters ?? 0),
      duration: String(route.duration ?? "0s"),
      polyline: String(route.polyline.encodedPolyline),
      optimizedOrder: Array.isArray(route.optimizedIntermediateWaypointIndex)
        ? route.optimizedIntermediateWaypointIndex.map((i: any) => Number(i))
        : [],
      legs: Array.isArray(route.legs)
        ? route.legs.map((leg: any) => ({
            distanceMeters: Number(leg.distanceMeters ?? 0),
            duration: String(leg.duration ?? "0s"),
            polyline: String(leg.polyline?.encodedPolyline ?? ""),
            startLocation: {
              lat: Number(leg.startLocation?.latLng?.latitude ?? 0),
              lng: Number(leg.startLocation?.latLng?.longitude ?? 0),
            },
            endLocation: {
              lat: Number(leg.endLocation?.latLng?.latitude ?? 0),
              lng: Number(leg.endLocation?.latLng?.longitude ?? 0),
            },
          }))
        : [],
    };
  });
