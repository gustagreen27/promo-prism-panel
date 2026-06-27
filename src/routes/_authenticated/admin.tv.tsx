import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Tv } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tv")({
  head: () => ({ meta: [{ title: "Dashboard TV — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="Dashboard TV" description="Visão em tela cheia para exibição." />
      <EmptyState icon={Tv} title="Em construção" description="Em breve você terá a visão TV otimizada." />
    </>
  ),
});
