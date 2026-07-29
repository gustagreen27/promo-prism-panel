/**
 * Resolução segura de conexão + token (server-only).
 *
 * Regras:
 * - Usuário precisa ser admin OU membro do workspace da conexão.
 * - access_token é obrigatório salvo quando use_global_token=true.
 * - Nunca aceita phone_number_id, waba_id, app_id ou token do frontend.
 */

export type LoadedConnection = {
  id: string;
  workspace_id: string | null;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
  use_global_token: boolean;
  current_display_name: string | null;
  requested_display_name: string | null;
  display_name_status: string | null;
  display_phone: string | null;
  verified_name: string | null;
  app_id: string | null;
  app_secret: string | null;
};

export async function loadConnectionSecure(
  supabase: any,
  userId: string,
  connectionId: string,
): Promise<LoadedConnection> {
  const { data: conn, error } = await supabase
    .from("whatsapp_connections")
    .select(
      "id, workspace_id, phone_number_id, waba_id, waba_ref_id, access_token, use_global_token, current_display_name, requested_display_name, display_name_status, display_phone, verified_name, app_id, app_secret",
    )
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw error;
  if (!conn) throw new Error("Conexão não encontrada.");
  if (!conn.phone_number_id) throw new Error("Phone Number ID ausente nesta conexão.");

  // Autorização: admin/staff OU membro do workspace
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) {
    if (!conn.workspace_id) throw new Error("Forbidden");
    const { data: isMember } = await supabase.rpc("is_workspace_member", {
      _ws: conn.workspace_id,
      _user: userId,
    });
    if (!isMember) throw new Error("Forbidden");
  }

  // Token — se use_global_token=true, preferir o global (ignorar token da conexão, que pode estar expirado)
  let token: string | undefined;
  if (conn.use_global_token) {
    token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "Token global (WHATSAPP_ACCESS_TOKEN) não configurado no ambiente.",
      );
    }
  } else {
    token = conn.access_token ?? undefined;
    if (!token) {
      throw new Error(
        "Esta conexão não possui um token de acesso configurado. Atualize o token ou marque 'Usar token global' nas configurações da conexão.",
      );
    }
  }


  return { ...(conn as any), access_token: token } as LoadedConnection;
}
