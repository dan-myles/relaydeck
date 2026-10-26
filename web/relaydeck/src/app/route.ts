import { useEffect, useState } from "react";

export type Route = { page: "setup" } | { page: "usage"; account?: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  const [page, kind, id] = path.split("/");
  if (page === "usage") {
    return kind === "account" && id ? { page: "usage", account: decodeURIComponent(id) } : { page: "usage" };
  }
  return { page: "setup" };
}

export function routeHref(route: Route): string {
  if (route.page === "usage") return route.account ? `#/usage/account/${encodeURIComponent(route.account)}` : "#/usage";
  return "#/setup";
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
