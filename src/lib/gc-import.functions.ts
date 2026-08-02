import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


export interface GcImportOrder {
  internal_id: string;
  order_number: string;
  customer_name: string;
  situation: string;
  delivery_date: string;
  total_value: number;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  phone: string | null;
  has_assembly: boolean;
  alreadyScheduled: boolean;
  scheduledRouteId: string | null;
  scheduledRouteZone: string | null;
  scheduledRouteDate: string | null;
}

export interface GcImportResult {
  orders: GcImportOrder[];
  error: string | null;
}

/** Lista todas as marcações (vendas) do GestãoClick com prazo de entrega na data indicada. */
export const listGcOrdersByDeliveryDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        scanAllSituations: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<GcImportResult> => {
    const { fetchSalesByDeliveryDate } = await import("./gc-import.server");
    const res = await fetchSalesByDeliveryDate({
      date: data.date,
      scanAllSituations: data.scanAllSituations,
    });
    if (res.error) return { orders: [], error: res.error };

    const codes = res.orders.map((o) => o.order_number);
    const sm = new Map<string, { id: string; zone: string | null; date: string | null }>();
    if (codes.length > 0) {
      const { data: scheduled } = await context.supabase
        .from("scheduled_deliveries")
        .select("order_number, route_id, routes:route_id(route_date, zone)")
        .in("order_number", codes)
        .in("status", ["agendado", "confirmado"]);
      for (const s of scheduled ?? []) {
        sm.set(String(s.order_number), {
          id: String(s.route_id),
          zone: (s as any).routes?.zone ?? null,
          date: (s as any).routes?.route_date ?? null,
        });
      }
    }

    return {
      orders: res.orders.map((o) => {
        const sx = sm.get(o.order_number);
        return {
          internal_id: o.internal_id,
          order_number: o.order_number,
          customer_name: o.customer_name,
          situation: o.situation,
          delivery_date: o.delivery_date,
          total_value: o.total_value,
          address: o.address,
          zip_code: o.zip_code,
          city: o.city,
          phone: o.phone,
          has_assembly: o.has_assembly,
          alreadyScheduled: Boolean(sx),
          scheduledRouteId: sx?.id ?? null,
          scheduledRouteZone: sx?.zone ?? null,
          scheduledRouteDate: sx?.date ?? null,
        };
      }),
      error: null,
    };
  });

export interface CreateRouteFromGcResult {
  routeId: string;
  routeCreated: boolean;
  imported: number;
  skipped: Array<{ order_number: string; reason: string }>;
}

/** Cria (ou usa) uma rota para a data e importa as marcações seleccionadas do GestãoClick. */
export const createRouteFromGcOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        templateId: z.string().uuid().optional(),
        routeId: z.string().uuid().optional(),
        orders: z
          .array(
            z.object({
              internal_id: z.string().min(1).max(40),
              order_number: z.string().min(1).max(40),
            }),
          )
          .min(1)
          .max(60),
        volume_m3: z.number().min(0).max(50).default(1),
        estimated_minutes: z.number().int().min(5).max(480).default(45),
      })
      .refine((v) => Boolean(v.templateId || v.routeId), {
        message: "Indica um template ou uma rota existente",
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CreateRouteFromGcResult> => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const privileged = (roles ?? []).some((r) => r.role === "admin" || r.role === "logistico");
    if (!privileged) throw new Error("Apenas administradores ou logística podem criar rotas");

    let routeId = data.routeId ?? null;
    let routeCreated = false;

    if (!routeId && data.templateId) {
      const { data: t, error: tErr } = await context.supabase
        .from("route_templates")
        .select("*")
        .eq("id", data.templateId)
        .maybeSingle();
      if (tErr) throw new Error(tErr.message);
      if (!t) throw new Error("Template não encontrado");

      const { data: existing } = await context.supabase
        .from("routes")
        .select("id")
        .eq("template_id", t.id)
        .eq("route_date", data.date)
        .maybeSingle();
      if (existing) {
        routeId = existing.id;
      } else {
        const { data: ins, error } = await context.supabase
          .from("routes")
          .insert({
            template_id: t.id,
            route_date: data.date,
            zone: t.zone,
            zip_prefixes: t.zip_prefixes,
            driver: t.default_driver,
            max_capacity_m3: t.max_capacity_m3,
            max_minutes: t.max_minutes ?? 480,
            color: t.color ?? "#3b82f6",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        routeId = ins.id;
        routeCreated = true;
      }
    }
    if (!routeId) throw new Error("Rota indisponível");

    const { data: route } = await context.supabase
      .from("routes")
      .select("id, status, route_date")
      .eq("id", routeId)
      .maybeSingle();
    if (!route) throw new Error("Rota não encontrada");
    if (["fechada", "concluida"].includes(route.status)) throw new Error("Esta rota já está fechada");
    await assertRouteUnlocked(context, routeId);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const sellerName = profile?.display_name ?? profile?.email ?? null;

    const { fetchSaleDetail } = await import("./gc-import.server");

    const skipped: Array<{ order_number: string; reason: string }> = [];
    let imported = 0;

    for (const item of data.orders) {
      try {
        const { data: dup } = await context.supabase
          .from("scheduled_deliveries")
          .select("id")
          .eq("order_number", item.order_number)
          .in("status", ["agendado", "confirmado"])
          .maybeSingle();
        if (dup) {
          skipped.push({ order_number: item.order_number, reason: "Já agendada noutra rota" });
          continue;
        }

        const o = await fetchSaleDetail(item.internal_id, item.order_number);
        if (!o) {
          skipped.push({ order_number: item.order_number, reason: "Sem dados no GestãoClick" });
          continue;
        }
        if (!o.address || o.address === "—") {
          skipped.push({ order_number: item.order_number, reason: "Sem morada" });
          continue;
        }

        const minutes = o.has_assembly && data.estimated_minutes < 60 ? 60 : data.estimated_minutes;

        const { error } = await context.supabase.from("scheduled_deliveries").insert({
          route_id: routeId,
          order_number: o.order_number,
          customer_name: o.customer_name,
          address: o.address,
          zip_code: o.zip_code,
          city: o.city,
          phone: o.phone ?? o.mobile ?? null,
          total_value: o.total_value,
          paid_value: o.paid_value,
          volume_m3: data.volume_m3,
          delivery_type: "entrega",
          estimated_minutes: minutes,
          notes: null,
          order_payload: {
            items: o.items ?? [],
            pagamentos: o.pagamentos ?? [],
            has_assembly: o.has_assembly ?? false,
            has_delivery_service: o.has_delivery_service ?? false,
            observations: o.observations ?? null,
            status: o.status ?? null,
            date: o.date ?? null,
          } as unknown as never,
          seller_id: context.userId,
          seller_name: sellerName,
          status: "agendado",
        });
        if (error) {
          skipped.push({ order_number: item.order_number, reason: error.message });
          continue;
        }
        imported += 1;
        // Estas marcações já estão agendadas no GestãoClick — não alteramos a situação/data lá.
      } catch (e) {
        skipped.push({
          order_number: item.order_number,
          reason: e instanceof Error ? e.message : "Erro desconhecido",
        });
      }
    }

    return { routeId, routeCreated, imported, skipped };
  });
