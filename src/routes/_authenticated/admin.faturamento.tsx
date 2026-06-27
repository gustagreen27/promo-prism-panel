import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/faturamento")({
  head: () => ({ meta: [{ title: "Faturamento — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Faturamento" description="Receitas e recebimentos do período." />
      <EmptyState icon={Wallet} title="Em construção" description="Em breve você poderá registrar e acompanhar faturamentos por aqui." />
    </>
  ),
});
