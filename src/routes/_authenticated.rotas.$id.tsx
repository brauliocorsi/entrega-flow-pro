import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/rotas/$id")({
  component: RouteLayout,
});

function RouteLayout() {
  return <Outlet />;
}