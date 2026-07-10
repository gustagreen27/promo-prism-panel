import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, CalendarPlus, ExternalLink, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { RELATORIOS_TABS } from "@/components/admin/hub-tabs";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listEvents, createEvent, updateEvent, deleteEvent, syncEventToGoogle, googleCalendarStatus } from "@/lib/calendar.functions";
import { listClients } from "@/lib/clients.functions";
import { listProjects } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/admin/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Painel" }] }),
  component: Page,
});

const TYPES = ["reuniao", "disparo", "entrega", "follow_up", "interno", "outro"];
const STATUS = ["agendado", "concluido", "cancelado"] as const;

function Page() {
  const navigate = useNavigate();
  const list = useServerFn(listEvents);
  const create = useServerFn(createEvent);
  const update = useServerFn(updateEvent);
  const remove = useServerFn(deleteEvent);
  const sync = useServerFn(syncEventToGoogle);
  const gcalStatus = useServerFn(googleCalendarStatus);
  const clientsFn = useServerFn(listClients);
  const projectsFn = useServerFn(listProjects);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["events"], queryFn: () => list() });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => clientsFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const { data: gcal } = useQuery({ queryKey: ["gcal-status"], queryFn: () => gcalStatus() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [defaults, setDefaults] = useState<any>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["events"] });
  const saveMut = useMutation({
    mutationFn: async (p: any) => (editing ? update({ data: { id: editing.id, ...p } }) : create({ data: p })),
    onSuccess: (row: any) => {
      toast.success("Salvo");
      setOpen(false);
      const wasNew = !editing;
      const isDisparo = row?.event_type === "disparo";
      setEditing(null);
      setDefaults(null);
      refresh();
      // Se criou "disparo" novo, oferece já criar a campanha
      if (wasNew && isDisparo && row?.id) {
        navigate({
          to: "/painel/campanhas/nova",
          search: { event_id: row.id, scheduled_for: row.start_time },
        });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const delMut = useMutation({ mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); refresh(); } });
  const syncMut = useMutation({
    mutationFn: (id: string) => sync({ data: { id, calendar_id: "primary" } }),
    onSuccess: (r: any) => { toast.success("Sincronizado com Google Calendar"); if (r?.html_link) window.open(r.html_link, "_blank"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao sincronizar"),
  });

  function openNewDisparo() {
    setEditing(null);
    setDefaults({ event_type: "disparo", title: "Disparo — ", status: "agendado" });
    setOpen(true);
  }

  return (
    <>
      <PageHeader tabs={RELATORIOS_TABS} title="Agenda" description="Eventos, reuniões e disparos." actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={openNewDisparo}>
            <CalendarPlus className="mr-2 h-4 w-4" />Agendar disparo
          </Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setDefaults(null); } }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novo evento</Button></DialogTrigger>
            <FormDialog editing={editing ?? defaults} clients={clients} projects={projects} onSubmit={(p: any) => saveMut.mutate(p)} saving={saveMut.isPending} />
          </Dialog>
        </div>
      } />
      {!gcal?.connected && (
        <div className="mb-3 rounded border border-dashed p-3 text-xs text-muted-foreground">
          Google Calendar não está conectado. Conecte-o em <b>Conectores</b> para sincronizar eventos com sua agenda Google.
        </div>
      )}
      <div className="rounded-xl border bg-card">
        {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          : data.length === 0 ? <EmptyState title="Sem eventos" />
          : <Table>
            <TableHeader><TableRow>
              <TableHead>Título</TableHead><TableHead>Tipo</TableHead>
              <TableHead>Início</TableHead><TableHead>Cliente / Campanha</TableHead>
              <TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.title}
                    {r.google_event_id && <Badge variant="outline" className="ml-2">Google ✓</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{r.event_type}</Badge></TableCell>
                  <TableCell>{new Date(r.start_time).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    {r.client?.name ?? "—"}
                    {r.campaign && (
                      <div className="text-xs text-muted-foreground">📣 {r.campaign.name} · {r.campaign.status}</div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {r.event_type === "disparo" && !r.campaign_id && (
                      <Button size="sm" variant="ghost" title="Criar campanha"
                        onClick={() => navigate({ to: "/painel/campanhas/nova", search: { event_id: r.id, scheduled_for: r.start_time } })}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {gcal?.connected && (
                      <Button size="icon" variant="ghost" title="Sincronizar com Google Calendar"
                        onClick={() => syncMut.mutate(r.id)} disabled={syncMut.isPending}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm("Remover?") && delMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
      </div>
    </>
  );
}

function FormDialog({ editing, clients, projects, onSubmit, saving }: any) {
  const toLocal = (v?: string) => v ? new Date(v).toISOString().slice(0, 16) : "";
  const [form, setForm] = useState<any>(() => editing ? {
    ...editing,
    start_time: editing.start_time ? toLocal(editing.start_time) : new Date().toISOString().slice(0, 16),
    end_time: toLocal(editing.end_time),
  } : {
    title: "", description: "", event_type: "reuniao",
    start_time: new Date().toISOString().slice(0, 16),
    end_time: "", status: "agendado", client_id: "", project_id: "",
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing?.id ? "Editar evento" : "Novo evento"}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Título</Label><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div><Label>Tipo</Label>
          <Select value={form.event_type} onValueChange={(v) => set("event_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Início</Label><Input type="datetime-local" value={form.start_time} onChange={(e) => set("start_time", e.target.value)} /></div>
        <div><Label>Fim</Label><Input type="datetime-local" value={form.end_time ?? ""} onChange={(e) => set("end_time", e.target.value)} /></div>
        <div><Label>Cliente</Label>
          <Select value={form.client_id ?? ""} onValueChange={(v) => set("client_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Projeto</Label>
          <Select value={form.project_id ?? ""} onValueChange={(v) => set("project_id", v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2"><Label>Descrição</Label><Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSubmit({
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : "",
      })}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
