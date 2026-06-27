import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Clientes" description="Cadastro de clientes." />
      <EmptyState icon={Users} title="Em construção" description="Em breve você poderá cadastrar e gerenciar clientes." />
    </>
  ),
});
