import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  access_token: z.string().trim().max(600).optional().nullable(),
  business_id: z.string().trim().max(40).optional().nullable(),
  workspace_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
});

/** Busca as WABAs compartilhadas com a nossa BM na Meta e importa para o sistema. */
export const syncSharedWabasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { syncSharedWabas } = await import("@/lib/wa-sync-shared.server");
    return syncSharedWabas(context.supabase, data);
  });
