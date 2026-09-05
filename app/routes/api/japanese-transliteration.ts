import { createFileRoute } from "@tanstack/react-router";

import type {
  JapaneseTransliterationGroup,
  SavedJapaneseTransliteration,
} from "../../store/session.store";

const TRANSLITERATION_URL = "http://localhost:4000/v1/transliterate";

const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1_200;
const MAXIMUM_ATTEMPTS = 4;
const MAXIMUM_TOTAL_CHARACTERS = 20_000;

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function unconvertedGroup(surface: string): JapaneseTransliterationGroup {
  return {
    surface,
    romaji: "",
    hiragana: "",
    katakana: "",
    gloss: "",
    lemma: surface,
    partOfSpeech: "",
    form: "",
  };
}

function insertUnconvertedText(
  sourceText: string,
  groups: JapaneseTransliterationGroup[],
): JapaneseTransliterationGroup[] {
  const result: JapaneseTransliterationGroup[] = [];
  let cursor = 0;

  const addGap = (surface: string) => {
    if (surface) result.push(unconvertedGroup(surface));
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

interface TransliterationToken {
  surface: string;
  lemma?: string;
  partOfSpeech?: { primary?: string | null };
  reading?: { hiragana?: string; katakana?: string; romaji?: string };
  inflection?: { form?: string } | null;
}

interface TransliterationResponse {
  tokens?: TransliterationToken[];
  sentences?: Array<{ tokens?: TransliterationToken[] }>;
}

function tokenToGroup(token: TransliterationToken): JapaneseTransliterationGroup {
  return {
    surface: token.surface,
    romaji: token.reading?.romaji ?? "",
    hiragana: token.reading?.hiragana ?? "",
    katakana: token.reading?.katakana ?? "",
    gloss: "",
    lemma: token.lemma ?? token.surface,
    partOfSpeech: token.partOfSpeech?.primary ?? "",
    form: token.inflection?.form ?? "",
  };
}

function parseTransliterationResponse(response: TransliterationResponse) {
  const tokens =
    response.tokens ?? response.sentences?.flatMap((sentence) => sentence.tokens ?? []) ?? [];
  const groups = tokens.filter((token) => token.surface).map(tokenToGroup);
  if (groups.length === 0 || groups.every((group) => !group.romaji)) {
    throw new Error("Transliteration service returned no readings");
  }
  return groups;
}

async function convertJapaneseOnce(content: string) {
  const response = await fetch(TRANSLITERATION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ text: content }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Transliteration service returned ${response.status}`);
  const result = (await response.json()) as TransliterationResponse;
  return { groups: parseTransliterationResponse(result), resultUrl: TRANSLITERATION_URL };
}

async function convertJapanese(content: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAXIMUM_ATTEMPTS; attempt++) {
    try {
      return await convertJapaneseOnce(content);
    } catch (error) {
      lastError = error;
      if (attempt < MAXIMUM_ATTEMPTS - 1) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Japanese transliteration failed");
}

async function convertJapaneseLines(lines: string[]) {
  const groupsByLine = new Map<number, JapaneseTransliterationGroup[]>();
  const failures: string[] = [];
  let requestCount = 0;

  await Promise.all(
    lines.map(async (line, lineIndex) => {
      requestCount++;
      try {
        const conversion = await convertJapanese(line);
        groupsByLine.set(lineIndex, insertUnconvertedText(line, conversion.groups));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "conversion failed");
      }
    }),
  );

  const convertedAt = new Date().toISOString();
  const transliterations: Record<string, SavedJapaneseTransliteration> = {};

  lines.forEach((line, lineIndex) => {
    const groups = groupsByLine.get(lineIndex);
    if (!groups?.length || groups.every((group) => !group.romaji)) return;
    transliterations[line] = { sourceText: line, groups, convertedAt };
  });

  return { transliterations, failures, requestCount, resultUrl: TRANSLITERATION_URL };
}

export const Route = createFileRoute("/api/japanese-transliteration")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { content?: string; lines?: unknown };

          if (Array.isArray(body.lines)) {
            const lines = [
              ...new Set(
                body.lines
                  .filter((line): line is string => typeof line === "string")
                  .map((line) => line.trim())
                  .filter(Boolean),
              ),
            ];
            if (lines.length === 0) {
              return Response.json({ error: "Japanese text is required" }, { status: 400 });
            }
            const totalCharacters = lines.reduce((total, line) => total + line.length, 0);
            if (totalCharacters > MAXIMUM_TOTAL_CHARACTERS) {
              return Response.json({ error: "Japanese text is too long" }, { status: 400 });
            }

            const batch = await convertJapaneseLines(lines);
            if (Object.keys(batch.transliterations).length === 0) {
              return Response.json(
                { error: batch.failures[0] || "Japanese transliteration failed" },
                { status: 502 },
              );
            }
            return Response.json({
              transliterations: batch.transliterations,
              requestedCount: lines.length,
              convertedCount: Object.keys(batch.transliterations).length,
              requestCount: batch.requestCount,
              failures: batch.failures,
              providerResultUrl: batch.resultUrl,
            });
          }

          const content = body.content?.trim() || "";
          if (!content)
            return Response.json({ error: "Japanese text is required" }, { status: 400 });
          if (content.length > 2_000) {
            return Response.json({ error: "Japanese text is too long" }, { status: 400 });
          }

          const result = await convertJapanese(content);
          return Response.json({
            sourceText: content,
            convertedAt: new Date().toISOString(),
            groups: insertUnconvertedText(content, result.groups),
            providerResultUrl: result.resultUrl,
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
