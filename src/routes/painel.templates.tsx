import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/painel/templates")({
  head: () => ({ meta: [{ title: "Templates — Disparos FR" }] }),
  component: Page,
});

function Page() {
  return (
    <Card>
      <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Em construção. Esta área do painel do cliente será liberada em breve.
        </p>
      </CardContent>
    </Card>
  );
}
