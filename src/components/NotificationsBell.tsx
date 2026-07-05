import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Circle, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications, countUnreadNotifications,
  markNotificationRead, markAllNotificationsRead,
} from "@/lib/notifications.functions";

const SEVERITY_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

const SEVERITY_COLOR = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-destructive",
} as const;

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export function NotificationsBell({ workspaceId }: { workspaceId?: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const listFn = useServerFn(listMyNotifications);
  const countFn = useServerFn(countUnreadNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);

  const { data: unread = 0 } = useQuery({
    queryKey: ["notif-unread", workspaceId ?? null],
    queryFn: () => countFn({ data: { workspace_id: workspaceId ?? null } }),
    refetchInterval: 60_000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notif-list", workspaceId ?? null],
    queryFn: () => listFn({ data: { workspace_id: workspaceId ?? null, limit: 15 } }),
    enabled: open,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn({ data: { workspace_id: workspaceId ?? null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-unread"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      toast.success("Notificações marcadas como lidas");
    },
  });

  // Realtime
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`notif:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const n = payload.new as any;
          qc.invalidateQueries({ queryKey: ["notif-unread"] });
          qc.invalidateQueries({ queryKey: ["notif-list"] });
          const sev = n.severity as keyof typeof SEVERITY_ICON;
          const opts = { description: n.body ?? undefined };
          if (sev === "error") toast.error(n.title, opts);
          else if (sev === "warning") toast.warning(n.title, opts);
          else if (sev === "success") toast.success(n.title, opts);
          else toast(n.title, opts);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, qc]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-semibold">Notificações</div>
          <Button
            variant="ghost" size="sm" className="h-7 gap-1 text-xs"
            disabled={!unread || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {notifications.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Sem notificações ainda.
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n: any) => {
                const Icon = SEVERITY_ICON[n.severity as keyof typeof SEVERITY_ICON] ?? Info;
                const color = SEVERITY_COLOR[n.severity as keyof typeof SEVERITY_COLOR] ?? "text-muted-foreground";
                return (
                  <li
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 text-sm transition hover:bg-muted/50 ${n.is_read ? "opacity-70" : ""}`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate font-medium">{n.title}</div>
                        <div className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</div>
                      </div>
                      {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                      <div className="mt-1.5 flex items-center gap-2">
                        {n.link && (
                          <Link
                            to={n.link as never}
                            onClick={() => { if (!n.is_read) markOne.mutate(n.id); setOpen(false); }}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Abrir →
                          </Link>
                        )}
                        {!n.is_read && (
                          <button
                            onClick={() => markOne.mutate(n.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            <Circle className="h-2 w-2 fill-current" /> Marcar como lida
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2 text-center">
          <Link
            to="/painel/notificacoes"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
