import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  listMyNotifications, markNotificationRead, markAllNotificationsRead,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/painel/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Disparos FR" }] }),
  component: Page,
});

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: AlertCircle } as const;
const COLORS = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-destructive",
} as const;

function Page() {
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["notif-full"],
    queryFn: () => listFn({ data: { limit: 100 } }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn({ data: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-full"] });
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      toast.success("Todas marcadas como lidas");
    },
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-full"] });
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
    },
  });

  const unreadCount = rows.filter((r: any) => !r.is_read).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Bell className="h-6 w-6 text-primary" /> Notificações
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount ? `${unreadCount} não lidas` : "Você está em dia"}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={!unreadCount} onClick={() => markAll.mutate()}>
          <CheckCheck className="mr-2 h-4 w-4" /> Marcar todas
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          Nenhuma notificação por enquanto.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((n: any) => {
            const Icon = ICONS[n.severity as keyof typeof ICONS] ?? Info;
            const color = COLORS[n.severity as keyof typeof COLORS] ?? "text-muted-foreground";
            return (
              <Card key={n.id} className={n.is_read ? "opacity-70" : ""}>
                <CardContent className="flex gap-3 p-4">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">{n.title}</div>
                      <div className="flex items-center gap-2">
                        {!n.is_read && <Badge variant="secondary" className="text-[10px]">nova</Badge>}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(n.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>
                    {n.body && <div className="mt-1 text-sm text-muted-foreground">{n.body}</div>}
                    <div className="mt-2 flex gap-3">
                      {n.link && (
                        <Link to={n.link} className="text-xs font-medium text-primary hover:underline">
                          Abrir
                        </Link>
                      )}
                      {!n.is_read && (
                        <button
                          onClick={() => markOne.mutate(n.id)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Marcar como lida
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
