"use client";

import { Conversion, type Input, type Output } from "mediabunny";

import { getOverlayState, setOverlayState } from "../store/overlay.store";
import { getSessionState } from "../store/session.store";
import { defaultCellSize, defaultChineseFontSize, jyutpingFontSize } from "./constants";
import {
  endsRetroKaraokeBackingVocals,
  getEnglishKaraokeCaptions,
  getRetroKaraokeCellProgresses,
  getRetroKaraokeCueKey,
  getRetroKaraokeLyricCaptions,
  startsRetroKaraokeBackingVocals,
} from "./retro-karaoke-timing";
import { getSubtitleAtTime, parseSrt, transliterateCaptions } from "./srt";
import {
  parseMultilingualText,
  retrieveChineseRomanizationMap,
  retrieveJapaneseRomanizationMap,
} from "./transliteration/transliteration";
import { getClampedVideoCrop } from "./video-crop";

const INLINE_ENGLISH_FONT_SCALE = 0.5;
const INLINE_ENGLISH_CELL_MAX_WIDTH_MULTIPLIER = 3;
const INLINE_ENGLISH_CELL_PADDING = 2;
const INLINE_ENGLISH_MIN_FONT_PX = 4;
const JAPANESE_GROUP_WIDTH_PER_CHARACTER = 0.65;
const JAPANESE_MIN_FONT_PX = 8;
const RETRO_KARAOKE_BLUE = "#0021FB";
const RETRO_CHINESE_FONT = '"Songti SC", STSong, SimSun, "Noto Serif CJK TC", serif';

function getTextSizes() {
  const overlay = getOverlayState().overlay;
  return overlay.separateTextSizes
    ? {
        source: overlay.sourceTextSize,
        romanization: overlay.romanizationTextSize,
        translation: overlay.translationTextSize,
      }
    : { source: 1, romanization: 1, translation: 1 };
}

function getCardSizeFactor() {
  const sizes = getTextSizes();
  return Math.max(sizes.source, sizes.romanization, sizes.translation);
}

// Shared by preview and export; the full cue stays visible for its duration.
function drawBrainRotSubtitle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sourceText: string,
  translation: string,
  width: number,
  top: number,
  size: number,
) {
  if (!sourceText.trim()) return;
  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 7 * size;
  let y = top;
  const drawText = (text: string, fontSize: number, font: string) => {
    ctx.font = `900 ${fontSize}px ${font}`;
    ctx.lineWidth = fontSize * 0.14;
    // Wrap for layout only, keeping every line visible at once.
    const units =
      text
        .toUpperCase()
        .match(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[^\S\n]+|\n/gu,
        ) ?? [];
    let line = "";
    const drawLine = () => {
      ctx.strokeText(line.trim(), width / 2, y, width * 0.84);
      ctx.fillText(line.trim(), width / 2, y, width * 0.84);
      y += fontSize * 1.2;
      line = "";
    };
    for (const unit of units) {
      if (unit === "\n") {
        drawLine();
        continue;
      }
      if (line.trim() && ctx.measureText(line + unit).width > width * 0.84) drawLine();
      line += unit;
    }
    if (line.trim()) drawLine();
  };
  const drawSource = () =>
    drawText(
      sourceText.trim(),
      Math.max(12, 104 * size * getTextSizes().source),
      'Impact, "Arial Black", "Noto Sans CJK TC", sans-serif',
    );
  const drawTranslation = () =>
    drawText(
      translation.trim(),
      Math.max(12, 44 * size * getTextSizes().translation),
      '"Arial Black", sans-serif',
    );
  // This style traditionally places the translation below the main text.
  if (!getOverlayState().overlay.flipSubtitleRows || !translation.trim()) {
    drawSource();
    if (translation.trim()) {
      y += 16 * size;
      drawTranslation();
    }
  } else {
    drawTranslation();
    y += 16 * size;
    drawSource();
  }
  ctx.restore();
}

export const PREFERRED_TRANSLITERATION_SEGMENTS_PER_LINE = 7;
export const MAX_TRANSLITERATION_SEGMENTS_PER_LINE = 9;

const CHINESE_LINE_ENDING_CHARACTERS = new Set([
  "了",
  "啦",
  "吧",
  "呢",
  "嗎",
  "吗",
  "啊",
  "呀",
  "嘛",
  "囉",
  "啰",
  "咯",
  "喎",
  "哦",
  "哩",
  "咧",
]);
const CLOSING_PUNCTUATION = /^[，。！？；：、,.!?;:）】》」』”’…—]+$/u;

type PreloadedBackgroundImages = {
  fullImage: HTMLImageElement | null;
  doubleImage1: HTMLImageElement | null;
  doubleImage2: HTMLImageElement | null;
};

const backgroundImageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = backgroundImageCache.get(src);
  if (cached?.complete) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      backgroundImageCache.set(src, image);
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("Error loading background image"));
    };
    image.src = src;
  });
}

async function preloadBackgroundImages(): Promise<PreloadedBackgroundImages> {
  const overlay = getOverlayState().overlay;
  const images: PreloadedBackgroundImages = {
    fullImage: null,
    doubleImage1: null,
    doubleImage2: null,
  };

  if (overlay.backgroundMode === "full-image" && overlay.backgroundImage) {
    images.fullImage = await loadImage(overlay.backgroundImage);
  }

  if (overlay.backgroundMode === "double-image") {
    if (overlay.doubleBackgroundImage.image1) {
      images.doubleImage1 = await loadImage(overlay.doubleBackgroundImage.image1);
    }
    if (overlay.doubleBackgroundImage.image2) {
      images.doubleImage2 = await loadImage(overlay.doubleBackgroundImage.image2);
    }
  }

  return images;
}

export function getBackgroundImageDrawOffsetY(
  isLandscapeMode: boolean,
  canvasHeight: number,
  drawHeight: number,
  offsetY: number,
): number {
  const baseOffsetY = isLandscapeMode ? (canvasHeight - drawHeight) / 2 : 0;
  return baseOffsetY + offsetY;
}

function determineNonEnglishLanguage(text: string): string {
  if (text.includes("(jp)")) {
    return "jp";
  }
  if (text.includes("(yue)")) {
    return "yue";
  }
  if (text.includes("(ko)")) {
    return "ko";
  }
  return "zh";
}

function drawRetroKaraokeLine(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  progress: number,
) {
  const metrics = ctx.measureText(text);
  const renderedWidth = Math.min(metrics.width, maxWidth);

  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#ffffff";
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillText(text, x, y, maxWidth);

  if (progress <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(
    x - renderedWidth / 2 - ctx.lineWidth,
    y - ctx.lineWidth,
    renderedWidth * Math.min(1, progress) + ctx.lineWidth,
    lineHeight + ctx.lineWidth * 2,
  );
  ctx.clip();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = RETRO_KARAOKE_BLUE;
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/u);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawRetroKaraokeSubtitle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  captions: { jyutping: string; chinese: string }[],
  english: string,
  canvasWidth: number,
  topY: number,
  sizeMultiplier: number,
  progress: number,
  lengthInfluence: number,
  timingMultipliers: Record<number, number>,
) {
  const lyricCaptions = getRetroKaraokeLyricCaptions(captions);
  if (lyricCaptions.length === 0) return;

  const sizes = getTextSizes();
  const baseFontSize = 58 * sizeMultiplier;
  const fontSize = baseFontSize * sizes.source;
  const romanizationFontSize = Math.max(13, baseFontSize * 0.4 * sizes.romanization);
  const romanizationHeight = Math.max(
    baseFontSize * 0.52 * sizes.romanization,
    romanizationFontSize * 1.2,
  );
  const rowHeight = romanizationHeight + fontSize * 1.18;
  const cellGap = Math.max(7, 15 * sizeMultiplier);
  const maxWidth = canvasWidth * 0.86;

  ctx.save();
  const clampedProgress = Math.min(1, Math.max(0, progress));

  let currentY = topY;
  const flipRows = getOverlayState().overlay.flipSubtitleRows;
  const drawTranslation = () => {
    if (!english) return;
    ctx.font = `700 ${Math.max(14, baseFontSize * 0.48 * sizes.translation)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, 4 * sizeMultiplier);
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = "#ffffff";
    const englishLineHeight = Math.max(14 * 1.2, baseFontSize * 0.62 * sizes.translation);
    const strokeSafeWidth = Math.max(1, maxWidth - ctx.lineWidth * 4);
    const englishLines = wrapCanvasText(ctx, english, strokeSafeWidth);
    for (const [lineIndex, line] of englishLines.entries()) {
      const y = currentY + lineIndex * englishLineHeight;
      ctx.strokeText(line, canvasWidth / 2, y, strokeSafeWidth);
      ctx.fillText(line, canvasWidth / 2, y, strokeSafeWidth);
    }
    currentY += englishLines.length * englishLineHeight;
  };
  if (!flipRows) drawTranslation();

  const getCellWidth = (caption: { jyutping: string; chinese: string }) => {
    const romanization = caption.jyutping === "EN" ? "" : caption.jyutping;
    ctx.font = `700 ${romanizationFontSize}px Arial, sans-serif`;
    const romanizationWidth = ctx.measureText(romanization).width;
    ctx.font = `700 ${fontSize}px ${RETRO_CHINESE_FONT}`;
    return Math.max(romanizationWidth, ctx.measureText(caption.chinese).width) + cellGap;
  };

  const rows: (typeof lyricCaptions)[] = [];
  let row: typeof lyricCaptions = [];
  let rowWidth = 0;
  for (const caption of lyricCaptions) {
    const cellWidth = getCellWidth(caption);
    if (
      row.length > 0 &&
      (startsRetroKaraokeBackingVocals(caption.chinese) || rowWidth + cellWidth > maxWidth)
    ) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(caption);
    rowWidth += cellWidth;
    if (endsRetroKaraokeBackingVocals(caption.chinese)) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
  }
  if (row.length > 0) rows.push(row);

  const cellProgresses = getRetroKaraokeCellProgresses(
    lyricCaptions,
    clampedProgress,
    lengthInfluence,
    timingMultipliers,
  );
  let lyricCaptionIndex = 0;
  for (const [rowIndex, captionRow] of rows.entries()) {
    const widths = captionRow.map(getCellWidth);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    let x = (canvasWidth - totalWidth) / 2;

    for (const [captionIndex, caption] of captionRow.entries()) {
      const cellWidth = widths[captionIndex];
      const centerX = x + cellWidth / 2;
      const y = currentY + rowIndex * rowHeight;

      ctx.font = `700 ${romanizationFontSize}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, 3 * sizeMultiplier);
      ctx.strokeStyle = "#000000";
      ctx.fillStyle = "#ffffff";
      if (caption.jyutping !== "EN") {
        ctx.strokeText(caption.jyutping, centerX, y, cellWidth);
        ctx.fillText(caption.jyutping, centerX, y, cellWidth);
      }

      ctx.font = `700 ${fontSize}px ${RETRO_CHINESE_FONT}`;
      ctx.lineWidth = Math.max(4, 7 * sizeMultiplier);
      drawRetroKaraokeLine(
        ctx,
        caption.chinese,
        centerX,
        y + romanizationHeight,
        cellWidth,
        fontSize * 1.18,
        cellProgresses[lyricCaptionIndex] ?? 0,
      );

      lyricCaptionIndex += 1;
      x += cellWidth;
    }
  }
  if (flipRows) {
    currentY += rows.length * rowHeight;
    drawTranslation();
  }
  ctx.restore();
}

export function scaleBackgroundImageOffsetY(
  offsetY: number,
  previewHeight: number,
  isLandscapeMode: boolean,
): number {
  const renderHeight = isLandscapeMode ? 1080 : 1920;
  return offsetY * (previewHeight / renderHeight);
}

export async function handleDrawCanvas(canvas: HTMLCanvasElement, subtitle: any, time: number) {
  if (!canvas?.clientWidth || !canvas.clientHeight) {
    return;
  }

  const overlay = getOverlayState().overlay;
  const rendererSizeMultiplier = overlay.sizeMultiplier / 2;

  const targetWidth = overlay.isLandscapeMode ? 1920 : 1080;
  const targetHeight = overlay.isLandscapeMode ? 1080 : 1920;

  if (canvas.width !== targetWidth) {
    canvas.width = targetWidth;
  }
  if (canvas.height !== targetHeight) {
    canvas.height = targetHeight;
  }

  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (subtitle) {
    const captionText = parseMultilingualText(subtitle.text);
    const cantonese = captionText.yue || "";
    const mandarin = captionText.zh || "";
    const japanese = captionText.jp || "";
    const korean = captionText.ko || "";

    const languageCode = determineNonEnglishLanguage(subtitle.text);
    const nonEnglishSourceText = cantonese || mandarin || japanese || korean;
    const english = captionText.en || "";
    const sourceText = nonEnglishSourceText || english;
    if (overlay.subtitleStyle === "brain-rot") {
      drawBrainRotSubtitle(
        ctx,
        sourceText,
        nonEnglishSourceText ? english : "",
        canvas.width,
        overlay.verticalPosition,
        rendererSizeMultiplier,
      );
      return;
    }
    const transliterationMap = !nonEnglishSourceText
      ? getEnglishKaraokeCaptions(english)
      : languageCode === "jp"
        ? retrieveJapaneseRomanizationMap(
            sourceText,
            getSessionState().session.japaneseTransliterations[sourceText],
          )
        : retrieveChineseRomanizationMap(
            transliterateCaptions(sourceText, languageCode, {}),
            sourceText,
          );
    setOverlayState({ jsonData: { transliterationMap } });

    if (overlay.subtitleStyle === "retro-karaoke") {
      const duration = Math.max(0.001, subtitle.endTime - subtitle.startTime);
      drawRetroKaraokeSubtitle(
        ctx,
        transliterationMap,
        nonEnglishSourceText ? english : "",
        canvas.width,
        overlay.verticalPosition,
        rendererSizeMultiplier,
        (time - subtitle.startTime) / duration,
        overlay.retroKaraokeLengthInfluence,
        overlay.retroKaraokeTimingOverrides[
          getRetroKaraokeCueKey(subtitle.startTime, subtitle.endTime)
        ] ?? {},
      );
      return;
    }
    const rows = updateTransliterationRows(
      mergeConsecutiveEnglishWords(transliterationMap, ctx, rendererSizeMultiplier),
    );

    const rowSpacing = 0;
    const topMargin = overlay.verticalPosition;
    const spacingBetweenTextAndChars = 20;

    const cellSize = ((defaultCellSize * overlay.sizeMultiplier) / 2 - 5) * getCardSizeFactor();
    let currentTopY = topMargin;

    if (english) {
      ctx.save();
      ctx.fillStyle = "black";
      ctx.font = `${24 * rendererSizeMultiplier * getTextSizes().translation}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const englishY = overlay.flipSubtitleRows
        ? topMargin +
          rows.length * (cellSize + rowSpacing) +
          5 * getCardSizeFactor() +
          spacingBetweenTextAndChars
        : currentTopY;

      const text = english;
      const paddingX = 0;
      const paddingY = 8;
      const maxWidth = canvas.width * 0.8;
      const lineHeight = 28 * rendererSizeMultiplier * getTextSizes().translation;

      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine.length > 0) {
        lines.push(currentLine);
      }

      const longestLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const totalTextHeight = lines.length * lineHeight;

      const bgWidth = longestLineWidth + paddingX * 2;
      const bgX = canvas.width / 2 - bgWidth / 2;
      const bgY = englishY;
      const bgHeight = totalTextHeight + paddingY * 2;

      ctx.fillStyle = "rgba(255, 255, 255, 1)";
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      ctx.fillStyle = "black";
      for (const [index, line] of lines.entries()) {
        ctx.fillText(line, canvas.width / 2, englishY + paddingY + index * lineHeight);
      }

      ctx.restore();

      currentTopY = englishY + totalTextHeight + paddingY * 2 + spacingBetweenTextAndChars;
    }

    const chineseStartY = overlay.flipSubtitleRows ? topMargin : currentTopY;
    for (const [rowIndex, row] of rows.entries()) {
      const rowY = chineseStartY + rowIndex * (cellSize + rowSpacing);

      const totalWidth = row.reduce((acc, caption) => {
        if (caption.chinese === " " || caption.chinese === "") {
          return acc + cellSize / 3;
        }
        return (
          acc +
          computeTransliterationCellWidth(
            ctx,
            caption,
            rendererSizeMultiplier,
            languageCode,
            overlay.transliterationEnabled,
          )
        );
      }, 0);
      const startX = (canvas.width - totalWidth) / 2;
      let currentX = startX;
      for (const caption of row) {
        if (caption.chinese === " " || caption.chinese === "") {
          currentX += cellSize / 3;
        } else {
          drawCharacterCell(
            ctx,
            caption,
            currentX,
            rowY,
            rendererSizeMultiplier,
            languageCode,
            overlay.transliterationEnabled,
          );
          const captionWidth = computeTransliterationCellWidth(
            ctx,
            caption,
            rendererSizeMultiplier,
            languageCode,
            overlay.transliterationEnabled,
          );
          currentX += captionWidth;
        }
      }
    }
  }
}

export const mergeConsecutiveEnglishWords = (
  map: { jyutping: string; chinese: string }[],
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sizeMultiplier: number,
): { jyutping: string; chinese: string }[] => {
  const result: { jyutping: string; chinese: string }[] = [];
  let i = 0;
  const savedFont = ctx.font;
  const englishFontSize =
    defaultChineseFontSize *
    sizeMultiplier *
    getTextSizes().translation *
    INLINE_ENGLISH_FONT_SCALE;
  const maxCellWidth =
    defaultCellSize *
    sizeMultiplier *
    getTextSizes().translation *
    INLINE_ENGLISH_CELL_MAX_WIDTH_MULTIPLIER;
  ctx.font = `${englishFontSize}px Arial`;

  while (i < map.length) {
    const entry = map[i];

    if (entry.jyutping === "EN" && entry.chinese !== " " && entry.chinese !== "") {
      let combined = entry.chinese;
      let j = i + 1;

      while (
        j < map.length &&
        map[j].jyutping === "EN" &&
        map[j].chinese === " " &&
        j + 1 < map.length &&
        map[j + 1].jyutping === "EN" &&
        map[j + 1].chinese !== " " &&
        map[j + 1].chinese !== ""
      ) {
        const nextCombined = `${combined} ${map[j + 1].chinese}`;
        const nextCombinedWidth =
          ctx.measureText(nextCombined).width + INLINE_ENGLISH_CELL_PADDING * sizeMultiplier;
        if (nextCombinedWidth > maxCellWidth) {
          break;
        }
        combined = nextCombined;
        j += 2;
      }

      result.push({ jyutping: "EN", chinese: combined });
      i = j;
    } else {
      result.push(entry);
      i++;
    }
  }

  ctx.font = savedFont;
  return result;
};

export const updateTransliterationRows = (
  transliterationMap: { jyutping: string; chinese: string }[],
) => {
  const rows: { jyutping: string; chinese: string }[][] = [];
  let rowStart = 0;

  const isWhitespace = (index: number) => /^\s+$/u.test(transliterationMap[index]?.chinese ?? "");
  const shouldStayOnPreviousLine = (index: number) => {
    const text = transliterationMap[index]?.chinese ?? "";
    return CHINESE_LINE_ENDING_CHARACTERS.has(text) || CLOSING_PUNCTUATION.test(text);
  };

  while (rowStart < transliterationMap.length) {
    const remaining = transliterationMap.length - rowStart;
    if (remaining <= MAX_TRANSLITERATION_SEGMENTS_PER_LINE) {
      rows.push(transliterationMap.slice(rowStart));
      break;
    }

    const preferredEnd = rowStart + PREFERRED_TRANSLITERATION_SEGMENTS_PER_LINE;
    const maximumEnd = rowStart + MAX_TRANSLITERATION_SEGMENTS_PER_LINE;
    let rowEnd = preferredEnd;

    // A visible space is the clearest phrase boundary. Use the closest one on
    // either side of the preferred length, without making the row too short.
    const minimumNaturalEnd = Math.max(rowStart + 1, preferredEnd - 2);
    let naturalEnd: number | undefined;
    for (let index = rowStart; index < maximumEnd; index++) {
      const candidateEnd = index + 1;
      if (
        isWhitespace(index) &&
        candidateEnd >= minimumNaturalEnd &&
        (naturalEnd === undefined ||
          Math.abs(candidateEnd - preferredEnd) < Math.abs(naturalEnd - preferredEnd))
      ) {
        naturalEnd = candidateEnd;
      }
    }
    rowEnd = naturalEnd ?? rowEnd;

    // Sentence particles and closing punctuation belong to the phrase before
    // them. Let them extend a preferred-length row instead of orphaning them.
    while (rowEnd < maximumEnd && shouldStayOnPreviousLine(rowEnd)) {
      rowEnd++;
    }

    // Do not start a row with whitespace. It remains in the previous row so the
    // original segment map stays intact and internal spacing is preserved.
    while (rowEnd < maximumEnd && isWhitespace(rowEnd)) {
      rowEnd++;
    }

    rows.push(transliterationMap.slice(rowStart, rowEnd));
    rowStart = rowEnd;
  }

  return rows;
};

const toneToSegment = (tone: number) => {
  switch (tone) {
    case 1:
      return "ˉ¹";
    case 2:
      return "ˊ²";
    case 3:
      return "˗₃";
    case 4:
      return "ˎ₄";
    case 5:
      return "ˏ₅";
    case 6:
      return "ˍ₆";
    default:
      return "";
  }
};

export const computeEnglishCellWidth = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  sizeMultiplier: number,
): number => {
  const savedFont = ctx.font;
  const englishFontSize =
    defaultChineseFontSize *
    sizeMultiplier *
    getTextSizes().translation *
    INLINE_ENGLISH_FONT_SCALE;
  const maxCellWidth =
    defaultCellSize *
    sizeMultiplier *
    getTextSizes().translation *
    INLINE_ENGLISH_CELL_MAX_WIDTH_MULTIPLIER;
  ctx.font = `${englishFontSize}px Arial`;
  const measured = ctx.measureText(text).width;
  ctx.font = savedFont;
  return Math.min(measured + INLINE_ENGLISH_CELL_PADDING * sizeMultiplier, maxCellWidth);
};

export function computeTransliterationCellWidth(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  caption: { jyutping: string; chinese: string },
  sizeMultiplier: number,
  languageCode = "zh",
  transliterationEnabled = true,
) {
  if (caption.jyutping === "EN") {
    return computeEnglishCellWidth(ctx, caption.chinese, sizeMultiplier);
  }
  const sourceUnits = Math.max(1, Array.from(caption.chinese).length);
  const readingUnits = transliterationEnabled
    ? Math.max(1, Math.ceil(caption.jyutping.length / 6))
    : 1;
  if (languageCode === "jp") {
    return (
      defaultCellSize *
      sizeMultiplier *
      getCardSizeFactor() *
      Math.max(
        1,
        sourceUnits * JAPANESE_GROUP_WIDTH_PER_CHARACTER,
        readingUnits * JAPANESE_GROUP_WIDTH_PER_CHARACTER,
      )
    );
  }
  return (
    defaultCellSize * sizeMultiplier * getCardSizeFactor() * Math.max(sourceUnits, readingUnits)
  );
}

const fitFontSizeToWidth = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  preferredFontPx: number,
  minFontPx: number,
  maxWidth: number,
) => {
  const savedFont = ctx.font;
  let fontPx = preferredFontPx;
  while (fontPx > minFontPx) {
    ctx.font = `${fontPx}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontPx -= 1;
  }
  ctx.font = savedFont;
  return Math.max(fontPx, minFontPx);
};

const fitEnglishTextToWidth = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  preferredFontPx: number,
  maxWidth: number,
): { text: string; fontPx: number } => {
  const savedFont = ctx.font;
  let fontPx = preferredFontPx;
  let displayText = text;

  while (fontPx > INLINE_ENGLISH_MIN_FONT_PX) {
    ctx.font = `${fontPx}px Arial`;
    if (ctx.measureText(displayText).width <= maxWidth) {
      ctx.font = savedFont;
      return { text: displayText, fontPx };
    }
    fontPx -= 1;
  }

  ctx.font = `${INLINE_ENGLISH_MIN_FONT_PX}px Arial`;
  const ellipsis = "...";
  if (ctx.measureText(ellipsis).width > maxWidth) {
    ctx.font = savedFont;
    return { text: "", fontPx: INLINE_ENGLISH_MIN_FONT_PX };
  }

  while (displayText.length > 0 && ctx.measureText(`${displayText}${ellipsis}`).width > maxWidth) {
    displayText = displayText.slice(0, -1);
  }

  ctx.font = savedFont;
  return {
    text: displayText.length < text.length ? `${displayText}${ellipsis}` : displayText,
    fontPx: INLINE_ENGLISH_MIN_FONT_PX,
  };
};

export const drawCharacterCell = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  caption: { jyutping: string; chinese: string },
  x: number,
  y: number,
  sizeMultiplier: number,
  languageCode = "zh",
  transliterationEnabled = true,
) => {
  if (!ctx) return;
  const cellSize = defaultCellSize * sizeMultiplier * getCardSizeFactor();
  const cellWidth = computeTransliterationCellWidth(
    ctx,
    caption,
    sizeMultiplier,
    languageCode,
    transliterationEnabled,
  );

  if (caption.jyutping === "EN") {
    const cellWidth = computeEnglishCellWidth(ctx, caption.chinese, sizeMultiplier);
    ctx.fillStyle = "white";
    ctx.fillRect(x, y, cellWidth, cellSize);
    ctx.fillStyle = "black";
    const preferredInlineEnglishFontSize =
      defaultChineseFontSize *
      sizeMultiplier *
      getTextSizes().translation *
      INLINE_ENGLISH_FONT_SCALE;
    const maxTextWidth = Math.max(0, cellWidth - INLINE_ENGLISH_CELL_PADDING * sizeMultiplier);
    const fitted = fitEnglishTextToWidth(
      ctx,
      caption.chinese,
      preferredInlineEnglishFontSize,
      maxTextWidth,
    );
    ctx.font = `${fitted.fontPx}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellWidth, cellSize);
    ctx.clip();
    ctx.fillText(fitted.text, x + cellWidth / 2, y + cellSize / 2);
    ctx.restore();
    return;
  }

  const extractedTone = caption.jyutping.match(/[1-9]/);
  const tone = extractedTone ? extractedTone[0] : "";
  const segment = toneToSegment(Number.parseInt(tone));

  ctx.fillStyle = "white";
  ctx.fillRect(x, y, cellWidth, cellSize);

  ctx.fillStyle = "black";
  const jyutpingText = caption.jyutping.replace(tone, segment);
  const horizontalPadding = 6 * sizeMultiplier;
  const maxTextWidth = Math.max(0, cellWidth - horizontalPadding * 2);
  const romajiFontSize =
    languageCode === "jp"
      ? fitFontSizeToWidth(
          ctx,
          jyutpingText,
          "Arial",
          jyutpingFontSize * sizeMultiplier * getTextSizes().romanization,
          JAPANESE_MIN_FONT_PX * sizeMultiplier,
          maxTextWidth,
        )
      : jyutpingFontSize * sizeMultiplier * getTextSizes().romanization;
  ctx.font = `${romajiFontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paddingY = 15 * sizeMultiplier * getCardSizeFactor();

  if (transliterationEnabled && jyutpingText) {
    ctx.fillText(jyutpingText, x + cellWidth / 2, y + cellSize / 2 - paddingY);
  }

  const sourceFontSize =
    languageCode === "jp"
      ? fitFontSizeToWidth(
          ctx,
          caption.chinese,
          "Times New Roman",
          defaultChineseFontSize * sizeMultiplier * getTextSizes().source,
          JAPANESE_MIN_FONT_PX * sizeMultiplier,
          maxTextWidth,
        )
      : defaultChineseFontSize * sizeMultiplier * getTextSizes().source;
  ctx.font = `${sourceFontSize}px Times New Roman`;
  ctx.fillText(
    caption.chinese,
    x + cellWidth / 2,
    y + cellSize / 2 + (transliterationEnabled ? paddingY : 0),
  );
};

/**
 * Where a background image is drawn, in output pixels. The image covers its region, is
 * shifted by offsetY, then scaled about the region centre and shifted by offsetX.
 * Shared by the renderer and the live preview so both place images identically.
 */
export function getBackgroundImageRect({
  imageWidth,
  imageHeight,
  regionWidth,
  regionTop,
  regionHeight,
  centerVertically,
  offsetX,
  offsetY,
  scale,
}: {
  imageWidth: number;
  imageHeight: number;
  regionWidth: number;
  regionTop: number;
  regionHeight: number;
  centerVertically: boolean;
  offsetX: number;
  offsetY: number;
  scale: number;
}) {
  const regionAspect = regionWidth / regionHeight;
  const imageAspect = imageWidth / imageHeight;
  const coverWidth = imageAspect > regionAspect ? regionHeight * imageAspect : regionWidth;
  const coverHeight = imageAspect > regionAspect ? regionHeight : regionWidth / imageAspect;
  const coverX = (regionWidth - coverWidth) / 2;
  const coverY =
    regionTop + (centerVertically ? (regionHeight - coverHeight) / 2 : 0) + (offsetY || 0);
  const centerX = regionWidth / 2;
  const centerY = regionTop + regionHeight / 2;
  const appliedScale = scale || 1;

  return {
    x: centerX + (coverX - centerX) * appliedScale + (offsetX || 0),
    y: centerY + (coverY - centerY) * appliedScale,
    width: coverWidth * appliedScale,
    height: coverHeight * appliedScale,
  };
}

// Blurring fades the image edges to transparent, so the image is drawn
// slightly oversized to keep the visible area fully covered.
function drawBlurredImage(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  blur: number,
) {
  if (blur <= 0) {
    ctx.drawImage(image, x, y, width, height);
    return;
  }

  const bleed = blur * 2;
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(image, x - bleed, y - bleed, width + bleed * 2, height + bleed * 2);
  ctx.restore();
}

function addBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  width: number,
  height: number,
  colour: string,
  preloadedImages: PreloadedBackgroundImages,
) {
  if (!ctx) return;
  const overlay = getOverlayState().overlay;
  if (overlay.backgroundMode === "colour") {
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, width, height);
  }
  if (overlay.backgroundMode === "full-image") {
    const image = preloadedImages.fullImage;
    if (image) {
      const rect = getBackgroundImageRect({
        imageWidth: image.width,
        imageHeight: image.height,
        regionWidth: width,
        regionTop: 0,
        regionHeight: height,
        centerVertically: overlay.isLandscapeMode,
        offsetX: overlay.backgroundImageOffsetX,
        offsetY: overlay.backgroundImageOffsetY,
        scale: overlay.backgroundImageScale,
      });

      drawBlurredImage(
        ctx,
        image,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        overlay.backgroundImageBlur,
      );
    }
  }
  if (overlay.backgroundMode === "double-image") {
    const halfHeight = height / 2;
    const drawHalfImage = (
      image: HTMLImageElement | null,
      top: number,
      offsetY: number,
      blur: number,
      offsetX: number,
      scale: number,
    ) => {
      if (!image) return;

      const rect = getBackgroundImageRect({
        imageWidth: image.width,
        imageHeight: image.height,
        regionWidth: width,
        regionTop: top,
        regionHeight: halfHeight,
        centerVertically: true,
        offsetX,
        offsetY,
        scale,
      });

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, width, halfHeight);
      ctx.clip();
      drawBlurredImage(ctx, image, rect.x, rect.y, rect.width, rect.height, blur);
      ctx.restore();
    };

    drawHalfImage(
      preloadedImages.doubleImage1,
      0,
      overlay.doubleBackgroundImageOffsetY.image1,
      overlay.doubleBackgroundImageBlur.image1,
      overlay.doubleBackgroundImageOffsetX.image1,
      overlay.doubleBackgroundImageScale.image1,
    );
    drawHalfImage(
      preloadedImages.doubleImage2,
      halfHeight,
      overlay.doubleBackgroundImageOffsetY.image2,
      overlay.doubleBackgroundImageBlur.image2,
      overlay.doubleBackgroundImageOffsetX.image2,
      overlay.doubleBackgroundImageScale.image2,
    );
  }
}

export async function convertCanvas(
  verticalPosition: number,
  sizeMultiplier: number,
  input: Input,
  output: Output,
  parsedSubtitles: any[],
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  lyricsOffset: number = 0,
) {
  const overlay = getOverlayState().overlay;
  const preloadedImages = await preloadBackgroundImages();

  return await Conversion.init({
    input,
    output,
    trim: {
      start: overlay.startTime,
      end: overlay.endTime,
    },
    video: {
      process: async (sample) => {
        const width = overlay.isLandscapeMode ? 1920 : 1080;
        const height = overlay.isLandscapeMode ? 1080 : 1920;
        if (!ctx) {
          const canvas = new OffscreenCanvas(width, height);
          ctx = canvas.getContext("2d") as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D;
        }

        ctx.clearRect(0, 0, width, height);
        const doubleImagesOverVideo =
          overlay.backgroundMode === "double-image" && overlay.doubleImageLayer === "over";
        if (!doubleImagesOverVideo) {
          addBackground(ctx, width, height, overlay.colour as string, preloadedImages);
        }

        const rendererSizeMultiplier = sizeMultiplier / 2;
        const cellSize = ((defaultCellSize * sizeMultiplier) / 2 - 5) * getCardSizeFactor();
        const adjustedTimestamp = sample.timestamp + overlay.startTime;
        const subtitle = getSubtitleAtTime(parsedSubtitles, adjustedTimestamp + lyricsOffset);

        // At 1.0× the video spans the full output width.
        const fitScale = width / sample.displayWidth;
        const videoScale = fitScale * (overlay.videoScale || 1);
        const drawWidth = sample.displayWidth * videoScale;
        const videoCrop = getClampedVideoCrop(
          overlay.videoCropTop,
          overlay.videoCropBottom,
          sample.displayHeight,
          overlay.videoCropLeft,
          overlay.videoCropRight,
          sample.displayWidth,
        );
        const croppedSourceWidth = sample.displayWidth - videoCrop.left - videoCrop.right;
        const croppedSourceHeight = sample.displayHeight - videoCrop.top - videoCrop.bottom;
        const croppedDrawHeight = croppedSourceHeight * videoScale;
        const fitDrawHeight = croppedSourceHeight * fitScale;
        const anchorY =
          overlay.videoPosition === "center"
            ? (height - fitDrawHeight) / 2
            : overlay.videoPosition === "bottom"
              ? height - fitDrawHeight
              : 0;
        // Place and scale the visible crop, rather than the uncropped source bounds.
        let drawY =
          anchorY -
          (croppedDrawHeight - fitDrawHeight) / 2 -
          videoCrop.top * videoScale +
          overlay.videoOffsetY;
        let drawX =
          (width - drawWidth) / 2 +
          ((videoCrop.right - videoCrop.left) * videoScale) / 2 +
          overlay.videoOffsetX;

        // Ensure drawX/drawY are rounded for subpixel rendering accuracy
        drawX = Math.round(drawX);
        drawY = Math.round(drawY);

        // Draw the selected source region at its centred placement.
        sample.draw(
          ctx,
          videoCrop.left,
          videoCrop.top,
          croppedSourceWidth,
          croppedSourceHeight,
          drawX + videoCrop.left * videoScale,
          drawY + videoCrop.top * videoScale,
          croppedSourceWidth * videoScale,
          croppedDrawHeight,
        );

        if (doubleImagesOverVideo) {
          addBackground(ctx, width, height, overlay.colour as string, preloadedImages);
        }

        if (subtitle) {
          const captionText = parseMultilingualText(subtitle.text);
          const cantonese = captionText.yue || "";
          const mandarin = captionText.zh || "";
          const japanese = captionText.jp || "";
          const korean = captionText.ko || "";
          const english = captionText.en || "";

          const languageCode = determineNonEnglishLanguage(subtitle.text);
          const nonEnglishSourceText = cantonese || mandarin || japanese || korean;
          const sourceText = nonEnglishSourceText || english;
          if (overlay.subtitleStyle === "brain-rot") {
            drawBrainRotSubtitle(
              ctx,
              sourceText,
              nonEnglishSourceText ? english : "",
              width,
              verticalPosition,
              rendererSizeMultiplier,
            );
            return ctx.canvas;
          }
          const transliterationMap = !nonEnglishSourceText
            ? getEnglishKaraokeCaptions(english)
            : languageCode === "jp"
              ? retrieveJapaneseRomanizationMap(
                  sourceText,
                  getSessionState().session.japaneseTransliterations[sourceText],
                )
              : retrieveChineseRomanizationMap(
                  transliterateCaptions(sourceText, languageCode, {}),
                  sourceText,
                );
          if (overlay.subtitleStyle === "retro-karaoke") {
            const subtitleStart = subtitle.startTime ?? adjustedTimestamp;
            const subtitleEnd = subtitle.endTime ?? subtitleStart;
            const duration = Math.max(0.001, subtitleEnd - subtitleStart);
            drawRetroKaraokeSubtitle(
              ctx,
              transliterationMap,
              nonEnglishSourceText ? english : "",
              width,
              verticalPosition,
              rendererSizeMultiplier,
              (adjustedTimestamp + lyricsOffset - subtitleStart) / duration,
              overlay.retroKaraokeLengthInfluence,
              overlay.retroKaraokeTimingOverrides[
                getRetroKaraokeCueKey(subtitleStart, subtitleEnd)
              ] ?? {},
            );
            return ctx.canvas;
          }
          const rows = updateTransliterationRows(
            mergeConsecutiveEnglishWords(transliterationMap, ctx!, rendererSizeMultiplier),
          );

          const rowSpacing = 0;
          const topMargin = verticalPosition;
          const spacingBetweenTextAndChars = 20;

          let currentTopY = topMargin;

          if (english) {
            ctx.save();
            ctx.font = `${24 * rendererSizeMultiplier * getTextSizes().translation}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const englishY = overlay.flipSubtitleRows
              ? topMargin +
                rows.length * (cellSize + rowSpacing) +
                5 * getCardSizeFactor() +
                spacingBetweenTextAndChars
              : currentTopY;

            const text = english;
            const paddingX = 0;
            const paddingY = 8;
            const maxWidth = width * 0.8;
            const lineHeight = 28 * rendererSizeMultiplier * getTextSizes().translation;

            const words = text.split(" ");
            const lines: string[] = [];
            let currentLine = "";

            for (const word of words) {
              const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
              const metrics = ctx?.measureText(testLine) || { width: 0 };

              if (metrics.width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }

            if (currentLine.length > 0) {
              lines.push(currentLine);
            }

            const longestLineWidth = Math.max(
              ...lines.map((line) => ctx?.measureText(line).width || 0),
            );
            const totalTextHeight = lines.length * lineHeight;

            const bgWidth = longestLineWidth + paddingX * 2;
            const bgX = width / 2 - bgWidth / 2;
            const bgY = englishY;
            const bgHeight = totalTextHeight + paddingY * 2;

            ctx.fillStyle = "rgba(255, 255, 255, 1)";
            ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

            ctx.fillStyle = "black";
            for (const [index, line] of lines.entries()) {
              ctx?.fillText(line, width / 2, englishY + paddingY + index * lineHeight);
            }

            ctx.restore();

            currentTopY = englishY + totalTextHeight + paddingY * 2 + spacingBetweenTextAndChars;
          }

          const chineseStartY = overlay.flipSubtitleRows ? topMargin : currentTopY;

          if (ctx?.canvas) {
            for (const [rowIndex, row] of rows.entries()) {
              const rowY = chineseStartY + rowIndex * (cellSize + rowSpacing);

              const totalWidth = row.reduce((acc, caption) => {
                if (caption.chinese === " " || caption.chinese === "") {
                  return acc + cellSize / 3;
                }
                return (
                  acc +
                  computeTransliterationCellWidth(
                    ctx!,
                    caption,
                    rendererSizeMultiplier,
                    languageCode,
                    overlay.transliterationEnabled,
                  )
                );
              }, 0);
              const startX = ((ctx?.canvas?.width || 0) - totalWidth) / 2;

              let currentX = startX;
              for (const caption of row) {
                if (caption.chinese === " " || caption.chinese === "") {
                  currentX += cellSize / 3;
                } else {
                  drawCharacterCell(
                    ctx,
                    caption,
                    currentX,
                    rowY,
                    rendererSizeMultiplier,
                    languageCode,
                    overlay.transliterationEnabled,
                  );
                  const captionWidth = computeTransliterationCellWidth(
                    ctx!,
                    caption,
                    rendererSizeMultiplier,
                    languageCode,
                    overlay.transliterationEnabled,
                  );
                  currentX += captionWidth;
                }
              }
            }
          }
        }
        return ctx.canvas;
      },
    },
  });
}
