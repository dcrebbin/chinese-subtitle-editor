import { createFileRoute } from "@tanstack/react-router";

const LANGPAL_API_URL = process.env.LANGPAL_API_URL ?? "https://www.langpal.com.hk";

function langpalHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.LANGPAL_API_KEY ?? process.env.VITE_LANGPAL_API_KEY;
  if (apiKey) {
    headers["x-langpal-api-key"] = apiKey;
  }
  return headers;
}

export const Route = createFileRoute("/api/subtitles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = new URL(request.url).searchParams.get("query") ?? "";
        const upstream = await fetch(
          `${LANGPAL_API_URL}/api/subtitles?query=${encodeURIComponent(query)}`,
          {
            method: "GET",
            headers: langpalHeaders(),
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
          headers: langpalHeaders(),
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
