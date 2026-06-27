import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { ClipboardCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/fechamento")({
  head: () => ({ meta: [{ title: "Fechamento — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Fechamento" description="Fechamentos do período." />
      <EmptyState icon={ClipboardCheck} title="Em construção" description="Em breve você poderá realizar e revisar fechamentos." />
    </>
  ),
});
