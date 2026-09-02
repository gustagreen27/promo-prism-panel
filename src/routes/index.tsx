import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "next DISPAROS" },
      { name: "description", content: "next DISPAROS." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "next DISPAROS" },
      { property: "og:description", content: "next DISPAROS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BlankHome,
});

function BlankHome() {
  return <main className="min-h-screen bg-background" aria-hidden="true" />;
}
