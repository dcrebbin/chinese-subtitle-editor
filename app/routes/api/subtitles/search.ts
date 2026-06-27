import { createFileRoute } from "@tanstack/react-router";

import { getLangpalHeaders, LANGPAL_API_URL } from "../../../utilities/api";

export const Route = createFileRoute("/api/subtitles/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams.get("query") ?? "";
        const apiUrl = `${LANGPAL_API_URL}/api/subtitles/search?query=${encodeURIComponent(query)}`;
        const upstream = await fetch(apiUrl, {
          method: "GET",
          headers: getLangpalHeaders(),
        });

        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
          },
        });
      },
    },
  },
});
