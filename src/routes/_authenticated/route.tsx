import { createFileRoute, Outlet, redirect, notFound, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const internalRoles = new Set(["admin", "super_admin", "support", "finance", "operations"]);
    const isInternal = (roles ?? []).some((r) => internalRoles.has(r.role as string));
    if (!isInternal) {
      // Non-staff trying to reach /admin: respond as if the route doesn't exist
      throw notFound();
    }

    // Usuários restritos ao Atendimento (com números liberados específicos)
    const roleList = (roles ?? []).map((r) => r.role as string);
    const isAdmin = roleList.some((r) => r === "admin" || r === "super_admin");
    const { data: grants } = await supabase
      .from("attendance_number_grants")
      .select("phone_number_id")
      .eq("user_id", data.user.id);
    const attendanceOnly = !isAdmin && ((grants ?? []).length > 0 || roleList.includes("support"));
    if (attendanceOnly && !location.pathname.startsWith("/admin/atendimento")) {
      throw redirect({ to: "/admin/atendimento" });
    }

    return { user: data.user, attendanceOnly };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <div className="hidden text-xs text-muted-foreground sm:block">
                Painel administrativo
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto w-full max-w-7xl space-y-6">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
