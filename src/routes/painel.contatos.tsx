import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/painel/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Disparos FR" }] }),
  component: Page,
});

function Page() {
  return (
    <Card>
      <CardHeader><CardTitle>Contatos</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Em construção. Esta área do painel do cliente será liberada em breve.
        </p>
      </CardContent>
    </Card>
  );
}
