import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const zip4 = z.string().regex(/^\d{4}$/, "CP deve ter 4 dígitos");

export const listFeeRanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("delivery_fee_ranges")
      .select("*")
      .order("priority", { ascending: false })
      .order("zip_start", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertFeeRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().max(120).nullable().optional(),
        zip_start: zip4,
        zip_end: zip4,
        fee: z.number().min(0).max(100000),
        priority: z.number().int().min(0).max(1000).default(0),
        active: z.boolean().default(true),
        notes: z.string().max(500).nullable().optional(),
      })
      .refine((v) => v.zip_start <= v.zip_end, { message: "CP inicial deve ser menor ou igual ao final" })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("delivery_fee_ranges").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: ins, error } = await context.supabase
      .from("delivery_fee_ranges")
      .insert(rest)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteFeeRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("delivery_fee_ranges").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const suggestDeliveryFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ zip: zip4 }).parse(d))
  .handler(async ({ data, context }) => {
    const cp = data.zip;

    const { data: ranges, error } = await context.supabase
      .from("delivery_fee_ranges")
      .select("*")
      .eq("active", true)
      .lte("zip_start", cp)
      .gte("zip_end", cp);
    if (error) throw new Error(error.message);

    const matches = (ranges ?? []).slice().sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const widthA = Number(a.zip_end) - Number(a.zip_start);
      const widthB = Number(b.zip_end) - Number(b.zip_start);
      return widthA - widthB;
    });
    const best = matches[0] ?? null;

    const today = new Date().toISOString().slice(0, 10);
    const { data: routes, error: rErr } = await context.supabase
      .from("routes")
      .select("*")
      .gte("route_date", today)
      .order("route_date", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    const compatible = (routes ?? []).filter((r: any) => {
      if (["fechada", "concluida", "cheia"].includes(r.status)) return false;
      const prefs: string[] = r.zip_prefixes ?? [];
      if (prefs.length === 0) return true;
      return prefs.some((p) => cp.startsWith(p));
    });

    return { fee: best, allMatches: matches, routes: compatible };
  });
