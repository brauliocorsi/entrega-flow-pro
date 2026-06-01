import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VehicleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  plate: z.string().max(20).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  active: z.boolean().default(true),
});

const StaffInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  kind: z.enum(["motorista", "auxiliar"]),
  phone: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  active: z.boolean().default(true),
});

async function ensureAdmin(ctx: any) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem alterar este registo");
}

// Vehicles
export const listVehicles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vehicles")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => VehicleInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = {
      name: data.name,
      plate: data.plate?.trim() || null,
      notes: data.notes?.trim() || null,
      active: data.active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("vehicles").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("vehicles").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("vehicles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Staff
export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("staff")
      .select("*")
      .order("active", { ascending: false })
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StaffInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const payload = {
      name: data.name,
      kind: data.kind,
      phone: data.phone?.trim() || null,
      notes: data.notes?.trim() || null,
      active: data.active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("staff").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("staff").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { error } = await context.supabase.from("staff").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
