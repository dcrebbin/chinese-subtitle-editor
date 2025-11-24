"use client";
import { Conversion } from "mediabunny";
import {
  getSubtitleAtTime,
  parseSrt,
  transliterateCaptions,
} from "../utilities/srt";
import { retrieveChineseRomanizationMap } from "../utilities/transliteration";
import {
  defaultCellSize,
  defaultChineseFontSize,
  jyutpingFontSize,
} from "./page";

export function handleDrawCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  time: number,
  verticalPosition: number,
  sizeMultiplier: number,
  setJsonData: (data: any) => void,
  videoDimensions: { width: number; height: number },
  customSrt: string
) {
  if (!canvasRef.current) {
    alert("No canvas found");
    return;
  }
  const canvas = canvasRef.current;
  const rendererSizeMultiplier = sizeMultiplier / 2;
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

  const canvasWidth = videoDimensions.width;
  const canvasHeight = videoDimensions.height;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const parsedSubtitles = parseSrt(customSrt);
  const subtitle = getSubtitleAtTime(parsedSubtitles, time);
  if (subtitle) {
    const cantonese = subtitle.text.split("(yue)")[1].split("(en)")[0].trim();
    const transliteratedText = transliterateCaptions(cantonese, true, {});

    const transliterationMap = retrieveChineseRomanizationMap(
      transliteratedText,
      cantonese
    );
    setJsonData(transliterationMap);
    const english = subtitle.text.split("(en)")[1].trim();
    const rows = updateTransliterationRows(transliterationMap);

    const rowSpacing = 0;
    const topMargin = verticalPosition;
    const spacingBetweenTextAndChars = 20;

    const cellSize = (defaultCellSize * sizeMultiplier) / 2 - 5;
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
      const maxWidth = canvasWidth * 0.8;
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
      const bgX = canvasWidth / 2 - bgWidth / 2;
      const bgY = englishY;
      const bgHeight = totalTextHeight + paddingY * 2;

      ctx.fillStyle = "rgba(255, 255, 255, 1)";
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      ctx.fillStyle = "black";
      for (const [index, line] of lines.entries()) {
        ctx.fillText(
          line,
          canvasWidth / 2,
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
      const startX = (canvasWidth - totalWidth) / 2;
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
            false
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
  sizeMultiplier: number,
  isLightsOut: boolean = false
) => {
  if (!ctx) return;
  const extractedTone = caption.jyutping.match(/[1-9]/);
  const tone = extractedTone ? extractedTone[0] : "";
  const segment = toneToSegment(Number.parseInt(tone));
  const cellSize = defaultCellSize * sizeMultiplier;

  // Draw cell background (70px x 70px squares)
  ctx.fillStyle = "white";
  ctx.fillRect(x, y, cellSize, cellSize);

  // Draw jyutping (smaller text at top)
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
  input: any,
  output: any,
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
                    rendererSizeMultiplier,
                    false
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
