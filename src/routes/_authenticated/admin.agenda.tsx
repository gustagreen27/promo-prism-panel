import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Agenda" description="Eventos, reuniões e compromissos." />
      <EmptyState icon={<Calendar className="h-5 w-5" />} title="Em construção" description="Em breve você poderá gerenciar a agenda por aqui." />
    </>
  ),
});
