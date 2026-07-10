/**
 * Auditoria de mudanças de perfil WhatsApp (server-only).
 */
import { MetaError } from "./meta-client.server";

export type ProfileAuditAction =
  | "PROFILE_UPDATED"
  | "PROFILE_PICTURE_UPDATED"
  | "DISPLAY_NAME_REQUESTED"
  | "DISPLAY_NAME_APPROVED"
  | "DISPLAY_NAME_REJECTED"
  | "DISPLAY_NAME_APPLIED"
  | "PROFILE_SYNCED"
  | "CONNECTION_DIAGNOSED"
  | "TOKEN_UPDATED"
  | "TOKEN_SOURCE_CHANGED"
  | "PHONE_NUMBER_ID_CORRECTED"
  | "WABA_ID_CORRECTED"
  | "APP_SUBSCRIBED"
  | "APP_SUBSCRIBE_FAILED";

export async function auditProfileEvent(params: {
  workspace_id?: string | null;
  connection_id: string;
  phone_number_id?: string | null;
  user_id?: string | null;
  action: ProfileAuditAction;
  previous_value?: any;
  new_value?: any;
  status?: "success" | "error";
  error?: unknown;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let meta_error_code: string | null = null;
  let meta_error_subcode: string | null = null;
  let meta_error_type: string | null = null;
  let meta_fbtrace_id: string | null = null;
  let error_message: string | null = null;
  if (params.error instanceof MetaError) {
    meta_error_code = params.error.code ? String(params.error.code) : null;
    meta_error_subcode = params.error.subcode ? String(params.error.subcode) : null;
    meta_error_type = params.error.type ?? null;
    meta_fbtrace_id = params.error.fbtrace_id ?? null;
    error_message = params.error.message;
  } else if (params.error) {
    error_message = (params.error as any)?.message ?? String(params.error);
  }
  try {
    await supabaseAdmin.from("whatsapp_profile_audit_logs").insert({
      workspace_id: params.workspace_id ?? null,
      connection_id: params.connection_id,
      phone_number_id: params.phone_number_id ?? null,
      user_id: params.user_id ?? null,
      action: params.action,
      previous_value: params.previous_value ?? null,
      new_value: params.new_value ?? null,
      status: params.status ?? (params.error ? "error" : "success"),
      meta_error_code,
      meta_error_subcode,
      meta_error_type,
      meta_fbtrace_id,
      error_message,
    });
  } catch {
    // não bloqueia a operação principal
  }
}
