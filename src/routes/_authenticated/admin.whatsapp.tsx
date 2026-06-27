import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Painel" }] }),
  component: () => (
    <>
      <PageHeader title="WhatsApp" description="Conexões e mensagens." />
      <EmptyState icon={<MessageSquare className="h-5 w-5" />} title="Em construção" description="Em breve você poderá conectar e enviar mensagens." />
    </>
  ),
});
