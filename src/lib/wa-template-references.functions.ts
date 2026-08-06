import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lista as referências de modelos salvas */
export const listTemplateReferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wa_template_references")
      .select("id,name,description,payload,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

/** Salva (ou atualiza) uma referência de modelo */
export const saveTemplateReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        description: z.string().max(300).optional().nullable(),
        payload: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("wa_template_references")
        .update({ name: data.name, description: data.description ?? null, payload: data.payload })
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("wa_template_references")
      .insert({
        name: data.name,
        description: data.description ?? null,
        payload: data.payload,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

/** Remove uma referência */
export const deleteTemplateReference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("wa_template_references").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
