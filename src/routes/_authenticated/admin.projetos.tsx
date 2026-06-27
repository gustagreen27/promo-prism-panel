import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/projetos")({
  head: () => ({ meta: [{ title: "Projetos — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Projetos" description="Projetos e entregas." />
      <EmptyState icon={<Briefcase className="h-5 w-5" />} title="Em construção" description="Em breve você poderá gerenciar projetos." />
    </>
  ),
});
