import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/painel/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — Disparos FR" }] }),
  component: Page,
});

function Page() {
  return (
    <Card>
      <CardHeader><CardTitle>Campanhas</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Em construção. Esta área do painel do cliente será liberada em breve.
        </p>
      </CardContent>
    </Card>
  );
}
