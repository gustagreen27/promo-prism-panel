import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  waba_id: z.string().trim().regex(/^\d{8,}$/, "Informe um WABA ID numérico válido."),
  access_token: z.string().trim().max(600).optional().nullable(),
  nome_interno: z.string().trim().max(120).optional().nullable(),
  workspace_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  project_id: z.string().uuid().optional().nullable(),
});

/** Importa para o sistema uma WABA já compartilhada com a nossa BM/app. */
export const claimSharedWabaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { claimSharedWaba } = await import("@/lib/wa-claim-shared.server");
    return claimSharedWaba(context.supabase, data);
  });
