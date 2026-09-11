import {
  convertToCustomTransliterations,
  convertToJyutping,
  convertToKorean,
  convertToPinyin,
} from "./transliteration/transliteration";

export function parseSrt(srtContent: string): {
  startTime: number | null;
  endTime: number | null;
  text: string;
}[] {
  const srtLines = srtContent.split(/\r?\n/);
  const subtitles: {
    startTime: number | null;
    endTime: number | null;
    text: string;
  }[] = [];
  let subtitle = { startTime: 0, endTime: 0, text: "" };
  const timePattern = /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/;

  srtLines.forEach((line) => {
    const match = timePattern.exec(line);
    if (match) {
      subtitle.startTime =
        Number.parseInt(match[1] ?? "0") * 3600 +
        Number.parseInt(match[2] ?? "0") * 60 +
        Number.parseInt(match[3] ?? "0") +
        Number.parseInt(match[4] ?? "0") / 1000;
      subtitle.endTime =
        Number.parseInt(match[5] ?? "0") * 3600 +
        Number.parseInt(match[6] ?? "0") * 60 +
        Number.parseInt(match[7] ?? "0") +
        Number.parseInt(match[8] ?? "0") / 1000;
    } else if (line.trim() === "") {
      if (subtitle.text) {
        subtitles.push({ ...subtitle });
      }
      subtitle = { startTime: 0, endTime: 0, text: "" };
    } else if (!/^\d+$/.test(line?.trim())) {
      subtitle.text += line + " ";
    }
  });

  if (subtitle.text.trim()) {
    subtitles.push({ ...subtitle });
  }

  return subtitles;
}

export function getSubtitleAtTime(
  parsedSubtitles: {
    startTime: number | null;
    endTime: number | null;
    text: string;
  }[],
  time: number,
): {
  startTime: number | null;
  endTime: number | null;
  text: string;
} | null {
  if (!time) {
    return null;
  }

  if (parsedSubtitles.length === 0) {
    return null;
  }

  const foundSubtitle = parsedSubtitles.find(
    (subtitle) => time >= (subtitle.startTime || 0) && time <= (subtitle.endTime || 0),
  );
  return foundSubtitle || null;
}

function formatSrtTime(time: number): string {
  const milliseconds = Math.max(0, Math.round(time * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${remainder
    .toString()
    .padStart(3, "0")}`;
}

/** Keep and re-time captions that overlap a cropped video range. */
export function cropSrtContent(srtContent: string, start: number, end: number): string {
  return parseSrt(srtContent)
    .filter((subtitle) => {
      const subtitleStart = subtitle.startTime ?? 0;
      const subtitleEnd = subtitle.endTime ?? 0;
      return subtitleEnd > start && subtitleStart < end;
    })
    .map((subtitle, index) => {
      const subtitleStart = Math.max(subtitle.startTime ?? 0, start) - start;
      const subtitleEnd = Math.min(subtitle.endTime ?? end, end) - start;
      return `${index + 1}\n${formatSrtTime(subtitleStart)} --> ${formatSrtTime(subtitleEnd)}\n${subtitle.text.trim()}`;
    })
    .join("\n\n");
}

export function transliterateCaptions(
  inputText: string,
  languageCode: string,
  customTransliterationsMap: Record<string, string>,
): string {
  if (Object.keys(customTransliterationsMap).length > 0) {
    return convertToCustomTransliterations(inputText, customTransliterationsMap);
  }

  switch (languageCode) {
    case "yue":
      return convertToJyutping(inputText);
    case "jp":
      // Japanese readings are generated explicitly per line and loaded from
      // the saved structured groups, never generated automatically here.
      return "";
    case "ko":
      return convertToKorean(inputText);
    default:
      return convertToPinyin(inputText);
  }
}
