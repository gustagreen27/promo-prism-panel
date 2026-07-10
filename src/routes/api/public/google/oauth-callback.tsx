import { createFileRoute, redirect } from "@tanstack/react-router";
import { verifyState } from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/api/public/google/oauth-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const backTo = (msg: string) => `/painel/configuracoes?gcal=${encodeURIComponent(msg)}`;

        if (err) return Response.redirect(new URL(backTo(`error:${err}`), url).toString(), 302);
        if (!code || !state) return Response.redirect(new URL(backTo("error:missing_code"), url).toString(), 302);

        const parsed = verifyState(state);
        if (!parsed) return Response.redirect(new URL(backTo("error:invalid_state"), url).toString(), 302);

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        const siteUrl = process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? url.origin;
        if (!clientId || !clientSecret) {
          return Response.redirect(new URL(backTo("error:missing_secrets"), url).toString(), 302);
        }

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: `${siteUrl}/api/public/google/oauth-callback`,
            grant_type: "authorization_code",
          }),
        });
        if (!tokenRes.ok) {
          return Response.redirect(new URL(backTo(`error:token_${tokenRes.status}`), url).toString(), 302);
        }
        const tokens = await tokenRes.json();
        const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

        // Fetch user email
        let email: string | null = null;
        try {
          const ur = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (ur.ok) email = (await ur.json()).email ?? null;
        } catch { /* ignore */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("workspace_google_calendar").upsert({
          workspace_id: parsed.workspaceId,
          connected_by: parsed.userId,
          google_email: email,
          calendar_id: "primary",
          calendar_name: "Primary",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          scopes: tokens.scope,
          auto_sync: true,
        }, { onConflict: "workspace_id" });

        return Response.redirect(new URL(backTo("ok"), url).toString(), 302);
      },
    },
  },
});
