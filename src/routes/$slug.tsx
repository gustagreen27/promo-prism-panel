import { createFileRoute, redirect } from "@tanstack/react-router";
import { trackClick } from "@/lib/track.functions";

export const Route = createFileRoute("/$slug")({
  head: () => ({ meta: [{ title: "Campanha" }] }),
  loader: async ({ params }) => {
    const res = await trackClick({ data: { slug: params.slug } });
    if (!res.ok) {
      return { status: "notfound" as const };
    }
    if (!res.iframeAllowed) {
      throw redirect({ href: res.destination_url });
    }
    return { status: "iframe" as const, url: res.destination_url };
  },
  component: CampaignPublicPage,
});

function CampaignPublicPage() {
  const data = Route.useLoaderData();

  if (data.status === "notfound") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-3xl font-semibold">Campanha não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verifique o link ou contate o responsável pela campanha.
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={data.url}
      title="Campanha"
      className="fixed inset-0 h-screen w-screen border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
