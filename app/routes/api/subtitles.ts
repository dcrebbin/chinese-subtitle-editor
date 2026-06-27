import { createFileRoute } from "@tanstack/react-router";

import { getLangpalHeaders, LANGPAL_API_URL } from "../../utilities/api";

export const Route = createFileRoute("/api/subtitles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams.get("query") ?? "";
        const upstream = await fetch(
          `${LANGPAL_API_URL}/api/subtitles?query=${encodeURIComponent(query)}`,
          {
            method: "GET",
            headers: getLangpalHeaders(),
          },
        );

        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
          },
        });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        const upstream = await fetch(`${LANGPAL_API_URL}/api/subtitles`, {
          method: "POST",
          headers: getLangpalHeaders(),
          body,
        });

        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "text/plain",
          },
        });
      },
    },
  },
});
