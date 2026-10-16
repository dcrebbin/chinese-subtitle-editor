import { createFileRoute } from "@tanstack/react-router";

import { getLangpalHeaders, LANGPAL_API_URL, LANGPAL_ASR_API_URL } from "../../utilities/api";

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
        if (request.headers.get("content-type")?.includes("multipart/form-data")) {
          const form = await request.formData();
          const audio = form.get("audio");
          if (
            !(audio instanceof File) ||
            !["audio/wav", "audio/x-wav", "audio/wave"].includes(audio.type) ||
            !audio.size ||
            audio.size > 24 * 1024 * 1024
          ) {
            return new Response("Provide extracted WAV audio under 24 MB.", { status: 400 });
          }
          const headers = new Headers(getLangpalHeaders());
          headers.delete("Content-Type");
          try {
            const upstream = await fetch(`${LANGPAL_ASR_API_URL}/api/subtitles/transcribe-audio`, {
              method: "POST",
              headers,
              body: form,
            });
            if (!upstream.ok) {
              const contentType = upstream.headers.get("Content-Type") ?? "";
              const detail = await upstream.text();
              console.error("Audio transcription failed:", upstream.status, detail.slice(0, 1000));
              const message = contentType.includes("text/html")
                ? "The subtitle server returned a web page. Check LANGPAL_ASR_API_URL points directly to the Elysia server."
                : upstream.status === 404
                  ? "The subtitle server needs the latest audio transcription route deployed."
                  : detail.slice(0, 500) || `Subtitle server failed (${upstream.status}).`;
              return Response.json({ message }, { status: upstream.status });
            }
            return new Response(upstream.body, {
              headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "text/plain" },
            });
          } catch (error) {
            console.error("Audio transcription server connection failed:", error);
            return Response.json(
              {
                message:
                  "Cannot reach the subtitle server. Check LANGPAL_ASR_API_URL and that Elysia is running.",
              },
              { status: 502 },
            );
          }
        }
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
