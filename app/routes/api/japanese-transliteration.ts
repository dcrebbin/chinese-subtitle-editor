import { createFileRoute } from "@tanstack/react-router";
import { load } from "cheerio";

import type { JapaneseTransliterationGroup } from "../../store/session.store";

const J_TALK_ORIGIN = "https://j-talk.com";
const J_TALK_CONVERT_URL = `${J_TALK_ORIGIN}/convert`;

type CookieJar = Map<string, string>;

function updateCookieJar(jar: CookieJar, headers: Headers) {
  const headersWithCookies = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headersWithCookies.getSetCookie?.() ?? [];
  const values = setCookies.length > 0 ? setCookies : [headers.get("set-cookie") || ""];

  for (const value of values) {
    for (const match of value.matchAll(/(?:^|,\s*)(XSRF-TOKEN|j_talk_session)=([^;]+)/g)) {
      jar.set(match[1] as string, match[2] as string);
    }
  }
}

function serializeCookies(jar: CookieJar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function requestHeaders(jar: CookieJar): HeadersInit {
  return {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: serializeCookies(jar),
    Origin: J_TALK_ORIGIN,
    Referer: J_TALK_CONVERT_URL,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  };
}

function extractResultUrl(html: string, response: Response): string | null {
  const location = response.headers.get("location");
  if (location) return new URL(location, J_TALK_ORIGIN).toString();

  const $ = load(html);
  const refresh = $('meta[http-equiv="refresh"]').attr("content") || "";
  const match = refresh.match(/url=['"]?([^'";]+)['"]?/i);
  return match?.[1] ? new URL(match[1], J_TALK_ORIGIN).toString() : null;
}

function insertUnconvertedText(
  sourceText: string,
  groups: JapaneseTransliterationGroup[],
): JapaneseTransliterationGroup[] {
  const result: JapaneseTransliterationGroup[] = [];
  let cursor = 0;

  const addGap = (surface: string) => {
    if (!surface) return;
    result.push({
      surface,
      romaji: "",
      hiragana: "",
      katakana: "",
      gloss: "",
      lemma: surface,
      partOfSpeech: "",
      form: "",
    });
  };

  for (const group of groups) {
    const index = sourceText.indexOf(group.surface, cursor);
    if (index >= cursor) {
      addGap(sourceText.slice(cursor, index));
      result.push(group);
      cursor = index + group.surface.length;
    } else {
      result.push(group);
    }
  }
  addGap(sourceText.slice(cursor));
  return result;
}

export function parseJTalkHtml(html: string, sourceText: string) {
  const $ = load(html);
  const groups: JapaneseTransliterationGroup[] = [];

  const parseElements = (selector: string) => {
    $(selector).each((_, row) => {
      const element = $(row);
      const source = element.find(".m").first();
      const surface = source.text().trim();
      if (!surface) return;

      groups.push({
        surface,
        romaji: element.find(".preference-romaji").first().text().trim().toLowerCase(),
        hiragana: element.find(".preference-hiragana").first().text().trim(),
        katakana: element.find(".preference-katakana").first().text().trim(),
        gloss: element.find(".gloss").first().text().trim(),
        lemma: source.attr("data-lemma") || surface,
        partOfSpeech: source.attr("data-pos1") || "",
        form: element.find(".form").first().text().trim(),
      });
    });
  };

  parseElements(".output-table tr.unit");
  if (groups.length === 0) {
    parseElements(".output-main .sentence .unit .word");
  }

  return insertUnconvertedText(sourceText, groups);
}

async function convertJapaneseOnce(content: string) {
  const cookies: CookieJar = new Map();
  const formResponse = await fetch(J_TALK_CONVERT_URL, {
    headers: requestHeaders(cookies),
  });
  updateCookieJar(cookies, formResponse.headers);
  if (!formResponse.ok) throw new Error(`j-talk form returned ${formResponse.status}`);

  const formHtml = await formResponse.text();
  const csrfToken = load(formHtml)('input[name="_token"]').attr("value");
  if (!csrfToken) throw new Error("j-talk CSRF token was not found");

  const body = new URLSearchParams({
    _token: csrfToken,
    content,
    convertOption: "main",
  });
  const conversionResponse = await fetch(J_TALK_CONVERT_URL, {
    method: "POST",
    headers: requestHeaders(cookies),
    body,
    redirect: "manual",
  });
  updateCookieJar(cookies, conversionResponse.headers);
  let resultHtml = await conversionResponse.text();

  const resultUrl = extractResultUrl(resultHtml, conversionResponse);
  if (resultUrl) {
    const parsedUrl = new URL(resultUrl);
    if (parsedUrl.origin !== J_TALK_ORIGIN) throw new Error("Unexpected j-talk redirect origin");
    if (parsedUrl.pathname === "/convert") {
      throw new Error("j-talk returned its input form instead of a conversion result");
    }
    const resultResponse = await fetch(parsedUrl, {
      headers: requestHeaders(cookies),
    });
    updateCookieJar(cookies, resultResponse.headers);
    if (!resultResponse.ok) throw new Error(`j-talk result returned ${resultResponse.status}`);
    resultHtml = await resultResponse.text();
  }

  const groups = parseJTalkHtml(resultHtml, content);
  if (groups.length === 0 || groups.every((group) => !group.romaji)) {
    throw new Error("No transliteration groups were found in the j-talk response");
  }
  return groups;
}

async function convertJapanese(content: string) {
  let lastError: unknown;
  const maximumAttempts = 5;
  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    try {
      return await convertJapaneseOnce(content);
    } catch (error) {
      lastError = error;
      if (attempt < maximumAttempts - 1) {
        // j-talk intermittently redirects automated requests back to its empty
        // form. A fresh session plus a real cooldown is much more reliable than
        // immediately repeating the rejected request.
        const delay = Math.min(1_500 * 2 ** attempt, 6_000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Japanese transliteration failed");
}

let conversionQueue: Promise<void> = Promise.resolve();

async function queueJapaneseConversion(content: string) {
  const previousConversion = conversionQueue.catch(() => undefined);
  let releaseQueue!: () => void;
  conversionQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousConversion;
  try {
    return await convertJapanese(content);
  } finally {
    releaseQueue();
  }
}

export const Route = createFileRoute("/api/japanese-transliteration")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { content?: string };
          const content = body.content?.trim() || "";
          if (!content)
            return Response.json({ error: "Japanese text is required" }, { status: 400 });
          if (content.length > 2_000) {
            return Response.json({ error: "Japanese text is too long" }, { status: 400 });
          }

          const groups = await queueJapaneseConversion(content);
          return Response.json({
            sourceText: content,
            convertedAt: new Date().toISOString(),
            groups,
          });
        } catch (error) {
          console.error("Japanese transliteration failed:", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Japanese transliteration failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
