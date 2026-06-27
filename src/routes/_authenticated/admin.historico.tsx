import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/historico")({
  head: () => ({ meta: [{ title: "Histórico — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Histórico" description="Linha do tempo de atividades." />
      <EmptyState icon={<History className="h-5 w-5" />} title="Em construção" description="Em breve você poderá ver o histórico completo." />
    </>
  ),
});
