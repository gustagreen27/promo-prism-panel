import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Boxes } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/estoque")({
  head: () => ({ meta: [{ title: "Estoque de Mensagens — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Estoque de Mensagens" description="Saldo disponível para disparos." />
      <EmptyState icon={<Boxes className="h-5 w-5" />} title="Em construção" description="Em breve você poderá gerenciar o estoque de mensagens." />
    </>
  ),
});
