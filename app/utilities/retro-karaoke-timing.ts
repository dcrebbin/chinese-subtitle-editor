export type RetroKaraokeCaption = { chinese: string; jyutping?: string };

const OPENING_BRACKETS = /^[([{（［【「『《〈]+$/u;
const CLOSING_BRACKETS = /^[)\]}）］】」』》〉]+$/u;
const STARTS_WITH_OPENING_BRACKET = /^[([{（［【「『《〈]/u;
const ENDS_WITH_CLOSING_BRACKET = /[)\]}）］】」』》〉]$/u;

export function startsRetroKaraokeBackingVocals(text: string) {
  return STARTS_WITH_OPENING_BRACKET.test(text.trim());
}

export function endsRetroKaraokeBackingVocals(text: string) {
  return ENDS_WITH_CLOSING_BRACKET.test(text.trim());
}

export function getEnglishKaraokeCaptions(text: string): { chinese: string; jyutping: string }[] {
  return text.match(/\S+|\s+/gu)?.map((part) => ({ chinese: part, jyutping: "EN" })) ?? [];
}

/**
 * Keep every visible lyric (including English embedded in a Cantonese line), while
 * attaching backing-vocal brackets to neighbouring timed cells. Whitespace is dropped
 * (cells are spaced by the renderer) so it can't offset the text from its romanization.
 */
export function getRetroKaraokeLyricCaptions<T extends RetroKaraokeCaption>(captions: T[]): T[] {
  const lyricCaptions: T[] = [];
  let openingBrackets = "";

  for (const caption of captions) {
    const text = caption.chinese.trim();
    if (!text) continue;

    if (caption.jyutping !== "EN") {
      lyricCaptions.push({
        ...caption,
        chinese: `${openingBrackets}${text}`,
      });
      openingBrackets = "";
    } else if (OPENING_BRACKETS.test(text)) {
      openingBrackets += text;
    } else if (CLOSING_BRACKETS.test(text) && lyricCaptions.length > 0) {
      const lastCaption = lyricCaptions[lyricCaptions.length - 1]!;
      lyricCaptions[lyricCaptions.length - 1] = {
        ...lastCaption,
        chinese: `${lastCaption.chinese}${text}`,
      };
    } else {
      lyricCaptions.push({
        ...caption,
        chinese: `${openingBrackets}${text}`,
      });
      openingBrackets = "";
    }
  }

  return lyricCaptions;
}

export function getRetroKaraokeCueKey(startTime: number, endTime: number) {
  return `${startTime.toFixed(3)}-${endTime.toFixed(3)}`;
}

export function getRetroKaraokeWeights(
  captions: RetroKaraokeCaption[],
  lengthInfluence: number,
  multipliers: Record<number, number> = {},
) {
  return captions.map((caption, index) => {
    const length = Math.max(1, Array.from(caption.chinese.trim()).length);
    const automaticWeight = 1 + (length - 1) * Math.max(0, lengthInfluence);
    return automaticWeight * Math.max(0.25, multipliers[index] ?? 1);
  });
}

/**
 * Convert line progress into progress for each syllable. Longer caption groups get
 * more time automatically, while a per-syllable multiplier handles sung holds.
 */
export function getRetroKaraokeCellProgresses(
  captions: RetroKaraokeCaption[],
  progress: number,
  lengthInfluence: number,
  multipliers: Record<number, number> = {},
) {
  const weights = getRetroKaraokeWeights(captions, lengthInfluence, multipliers);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const elapsedWeight = Math.min(1, Math.max(0, progress)) * totalWeight;

  let cellStart = 0;
  return weights.map((weight) => {
    const cellProgress = (elapsedWeight - cellStart) / weight;
    cellStart += weight;
    return Math.min(1, Math.max(0, cellProgress));
  });
}

/** Singing starts with the line unless a later onset is configured. */
export function getRetroKaraokeProgress(
  time: number,
  endTime: number,
  lineStart: number,
  singingStart?: number,
) {
  singingStart =
    singingStart !== undefined && Number.isFinite(singingStart)
      ? Math.min(endTime, Math.max(lineStart, singingStart))
      : lineStart;
  return Math.min(1, Math.max(0, (time - singingStart) / Math.max(0.001, endTime - singingStart)));
}
