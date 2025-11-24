import { convertToCustomTransliterations, convertToJyutping, convertToPinyin } from "./transliteration";

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
    const timePattern =
      /(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/;

    srtLines.forEach((line) => {
      const match = timePattern.exec(line);
      if (match) {
        subtitle.startTime =
          parseInt(match[1] ?? "0") * 3600 +
          parseInt(match[2] ?? "0") * 60 +
          parseInt(match[3] ?? "0") +
          parseInt(match[4] ?? "0") / 1000;
        subtitle.endTime =
          parseInt(match[5] ?? "0") * 3600 +
          parseInt(match[6] ?? "0") * 60 +
          parseInt(match[7] ?? "0") +
          parseInt(match[8] ?? "0") / 1000;
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

  export function getSubtitleAtTime(parsedSubtitles: {
    startTime: number | null;
    endTime: number | null;
    text: string;
  }[], time: number): {
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
      (subtitle) =>
        time >= (subtitle.startTime || 0) &&
        time <= (subtitle.endTime || 0)
    );
    return foundSubtitle || null;
  }

  export function transliterateCaptions(
    inputText: string,
    isCantoneseSelected: boolean,
    customTransliterationsMap: Record<string, string>
  ): string {
    if (Object.keys(customTransliterationsMap).length > 0) {
      return convertToCustomTransliterations(
        inputText,
        customTransliterationsMap
      );
    }
    if (isCantoneseSelected) {
      return convertToJyutping(inputText);
    }
    return convertToPinyin(inputText);
  }