import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    // Internal staff only reaches here (gate in _authenticated/route.tsx)
    throw redirect({ to: "/admin" });
  },
});
