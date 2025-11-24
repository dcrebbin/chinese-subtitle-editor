"use client";
import { Conversion, type Input, type Output } from "mediabunny";
import { getOverlayState, setOverlayState } from "../store/overlay.store";
import { getSessionState } from "../store/session.store";
import {
  defaultCellSize,
  defaultChineseFontSize,
  jyutpingFontSize,
} from "./constants";
import { getSubtitleAtTime, parseSrt, transliterateCaptions } from "./srt";
import { retrieveChineseRomanizationMap } from "./transliteration/transliteration";

export function handleDrawCanvas(canvas: HTMLCanvasElement, time: number) {
  if (!canvas?.clientWidth || !canvas.clientHeight) {
    return;
  }

  const overlay = getOverlayState().overlay;
  const session = getSessionState().session;
  const rendererSizeMultiplier = overlay.sizeMultiplier / 2;
  const parsedSubtitles = parseSrt(session.srtContent);
  const subtitle = getSubtitleAtTime(
    parsedSubtitles,
    time + overlay.lyricOffset
  );

  const targetWidth =
    overlay.videoDimensions?.width || Math.floor(canvas.clientWidth);
  const targetHeight =
    overlay.videoDimensions?.height || Math.floor(canvas.clientHeight);

  console.log(`Target dimensions: ${targetWidth}x${targetHeight}`);

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
    const cantonese = subtitle.text.split("(yue)")[1].split("(en)")[0].trim();
    const transliteratedText = transliterateCaptions(cantonese, true, {});

    const transliterationMap = retrieveChineseRomanizationMap(
      transliteratedText,
      cantonese
    );
    setOverlayState({ jsonData: { transliterationMap } });
    const english = subtitle.text.split("(en)")[1].trim();
    const rows = updateTransliterationRows(transliterationMap);

    const rowSpacing = 0;
    const topMargin = overlay.verticalPosition;
    const spacingBetweenTextAndChars = 20;

    const cellSize = (defaultCellSize * overlay.sizeMultiplier) / 2 - 5;
    let currentTopY = topMargin;

    if (english) {
      ctx.save();
      ctx.fillStyle = "black";
      ctx.font = `${24 * rendererSizeMultiplier}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const englishY = currentTopY;

      const text = english;
      const paddingX = 0;
      const paddingY = 8;
      const maxWidth = canvas.width * 0.8;
      const lineHeight = 28 * rendererSizeMultiplier;

      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine =
          currentLine.length === 0 ? word : `${currentLine} ${word}`;
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

      const longestLineWidth = Math.max(
        ...lines.map((line) => ctx.measureText(line).width)
      );
      const totalTextHeight = lines.length * lineHeight;

      const bgWidth = longestLineWidth + paddingX * 2;
      const bgX = canvas.width / 2 - bgWidth / 2;
      const bgY = englishY;
      const bgHeight = totalTextHeight + paddingY * 2;

      ctx.fillStyle = "rgba(255, 255, 255, 1)";
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      ctx.fillStyle = "black";
      for (const [index, line] of lines.entries()) {
        ctx.fillText(
          line,
          canvas.width / 2,
          englishY + paddingY + index * lineHeight
        );
      }

      ctx.restore();

      currentTopY =
        englishY + totalTextHeight + paddingY * 2 + spacingBetweenTextAndChars;
    }

    const chineseStartY = currentTopY;
    for (const [rowIndex, row] of rows.entries()) {
      const rowY = chineseStartY + rowIndex * (cellSize + rowSpacing);

      const totalWidth = row.reduce((acc, caption) => {
        if (caption.chinese === " " || caption.chinese === "") {
          return acc + cellSize / 3;
        }
        return acc + cellSize;
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
            rendererSizeMultiplier
          );
          currentX += cellSize;
        }
      }
    }
  }
}

export const updateTransliterationRows = (
  transliterationMap: { jyutping: string; chinese: string }[]
) => {
  const rows: { jyutping: string; chinese: string }[][] = [];
  for (let i = 0; i < Math.ceil(transliterationMap.length / 5); i++) {
    const newRow: { jyutping: string; chinese: string }[] = [];
    for (let j = 0; j < 5; j++) {
      const item = transliterationMap[i * 5 + j];
      if (item) {
        newRow.push(item);
      } else {
        break;
      }
    }
    rows.push(newRow);
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

export const drawCharacterCell = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  caption: { jyutping: string; chinese: string },
  x: number,
  y: number,
  sizeMultiplier: number
) => {
  if (!ctx) return;
  console.log(`drawing character cell ${caption.chinese}`);
  const extractedTone = caption.jyutping.match(/[1-9]/);
  const tone = extractedTone ? extractedTone[0] : "";
  const segment = toneToSegment(Number.parseInt(tone));
  const cellSize = defaultCellSize * sizeMultiplier;

  ctx.fillStyle = "white";
  ctx.fillRect(x, y, cellSize, cellSize);

  ctx.fillStyle = "black";
  ctx.font = `${jyutpingFontSize * sizeMultiplier}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paddingY = 15 * sizeMultiplier;

  const jyutpingText =
    caption.jyutping === "EN" ? "" : caption.jyutping.replace(tone, segment);
  if (jyutpingText) {
    ctx.fillText(jyutpingText, x + cellSize / 2, y + cellSize / 2 - paddingY);
  }

  ctx.font = `${defaultChineseFontSize * sizeMultiplier}px Arial`;
  ctx.fillText(caption.chinese, x + cellSize / 2, y + cellSize / 2 + paddingY);
};

export async function convertCanvas(
  verticalPosition: number,
  sizeMultiplier: number,
  input: Input,
  output: Output,
  parsedSubtitles: any[],
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  lyricsOffset: number = 0
) {
  return await Conversion.init({
    input,
    output,
    video: {
      process: (sample) => {
        if (!ctx) {
          const canvas = new OffscreenCanvas(
            sample.displayWidth,
            sample.displayHeight
          );
          ctx = canvas.getContext("2d") as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D;
        }

        const rendererSizeMultiplier = sizeMultiplier / 2;
        const cellSize = (defaultCellSize * sizeMultiplier) / 2 - 5;
        const subtitle = getSubtitleAtTime(
          parsedSubtitles,
          sample.timestamp + lyricsOffset
        );

        if (subtitle) {
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          sample.draw(ctx, 0, 0);

          const cantonese = subtitle.text
            .split("(yue)")[1]
            ?.split("(en)")[0]
            ?.trim();
          const english = subtitle.text.split("(en)")[1]?.trim();

          const transliteratedText = transliterateCaptions(cantonese, true, {});
          const transliterationMap = retrieveChineseRomanizationMap(
            transliteratedText,
            cantonese
          );
          const rows = updateTransliterationRows(transliterationMap);

          const rowSpacing = 0;
          const topMargin = verticalPosition;
          const spacingBetweenTextAndChars = 20;

          const totalRowsHeight =
            rows.length * cellSize + (rows.length - 1) * rowSpacing;

          let currentTopY = topMargin;

          if (english) {
            ctx.save();
            ctx.fillStyle = "black";
            ctx.font = `${24 * rendererSizeMultiplier}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const englishY = currentTopY;

            const text = english;
            const paddingX = 0;
            const paddingY = 8;
            const maxWidth = ctx.canvas.width * 0.8;
            const lineHeight = 28 * rendererSizeMultiplier;

            const words = text.split(" ");
            const lines: string[] = [];
            let currentLine = "";

            for (const word of words) {
              const testLine =
                currentLine.length === 0 ? word : `${currentLine} ${word}`;
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
              ...lines.map((line) => ctx?.measureText(line).width || 0)
            );
            const totalTextHeight = lines.length * lineHeight;

            const bgWidth = longestLineWidth + paddingX * 2;
            const bgX = ctx.canvas.width / 2 - bgWidth / 2;
            const bgY = englishY;
            const bgHeight = totalTextHeight + paddingY * 2;

            ctx.fillStyle = "rgba(255, 255, 255, 1)";
            ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

            ctx.fillStyle = "black";
            for (const [index, line] of lines.entries()) {
              ctx?.fillText(
                line,
                (ctx?.canvas?.width || 0) / 2,
                englishY + paddingY + index * lineHeight
              );
            }

            ctx.restore();

            currentTopY =
              englishY +
              totalTextHeight +
              paddingY * 2 +
              spacingBetweenTextAndChars;
          }

          const chineseStartY = currentTopY;

          if (ctx?.canvas) {
            for (const [rowIndex, row] of rows.entries()) {
              const rowY = chineseStartY + rowIndex * (cellSize + rowSpacing);

              const totalWidth = row.reduce((acc, caption) => {
                if (caption.chinese === " " || caption.chinese === "") {
                  return acc + cellSize / 3;
                }
                return acc + cellSize;
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
                    rendererSizeMultiplier
                  );
                  currentX += cellSize;
                }
              }
            }
          }
        } else {
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          sample.draw(ctx, 0, 0);
        }
        return ctx.canvas;
      },
    },
  });
}
