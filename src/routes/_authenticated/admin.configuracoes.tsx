import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Configurações" description="Preferências do sistema." />
      <EmptyState icon={<Settings className="h-5 w-5" />} title="Em construção" description="Em breve você poderá ajustar metas, usuários e integrações." />
    </>
  ),
});
