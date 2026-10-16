export const LANGPAL_API_URL = process.env.LANGPAL_API_URL ?? "https://www.langpal.com.hk";

// Audio multipart requests must reach Elysia directly; the website API handles JSON.
export const LANGPAL_ASR_API_URL = (
  process.env.LANGPAL_ASR_API_URL ?? "https://langpal-elysia.fly.dev"
).replace(/\/$/, "");

export function getLangpalHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.LANGPAL_API_KEY ?? process.env.VITE_LANGPAL_API_KEY;
  if (apiKey) {
    headers["x-langpal-api-key"] = apiKey;
  }
  return headers;
}
