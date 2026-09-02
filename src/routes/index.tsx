import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/site/landing-page";

const TITLE = "Next Disparos — Comunicação em escala e gestão de campanhas";
const DESCRIPTION =
  "Plataforma para planejar campanhas, acompanhar envios em tempo real e centralizar créditos, usuários e relatórios da sua operação.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});
