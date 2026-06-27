import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/custos")({
  head: () => ({ meta: [{ title: "Custos — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Custos" description="Despesas fixas e variáveis." />
      <EmptyState icon={<TrendingDown className="h-5 w-5" />} title="Em construção" description="Em breve você poderá lançar e categorizar custos." />
    </>
  ),
});
