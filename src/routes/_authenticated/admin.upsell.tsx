import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/upsell")({
  head: () => ({ meta: [{ title: "Upsell — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Upsell" description="Campanhas de upsell." />
      <EmptyState icon={Sparkles} title="Em construção" description="Em breve você poderá criar campanhas de upsell." />
    </>
  ),
});
