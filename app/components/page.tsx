"use client";

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { useEffect, useRef, useState } from "react";
import { parseSrt, transliterateCaptions } from "../utilities/srt";
import { retrieveChineseRomanizationMap } from "../utilities/transliteration";
import {
  convertCanvas,
  drawCharacterCell,
  handleDrawCanvas,
  updateTransliterationRows,
} from "./rendering";
import { useOverlayStore } from "../store/overlay.store";

export const defaultCellSize = 70;
export const defaultEnglishFontSize = 24;
export const defaultChineseFontSize = 32;
export const jyutpingFontSize = 16;
export const defaultTextHeight = 28;

function getVideoIdFromUrl(videoUrl: string) {
  let newVideoId = "";
  if (videoUrl?.includes("watch")) {
    newVideoId = videoUrl.split("watch?v=")[1] || "";
    newVideoId = newVideoId.split("&")[0];
  } else if (videoUrl?.includes("youtu.be")) {
    const splitUrl = videoUrl.split("/");
    if (splitUrl[3]) {
      const videoId = splitUrl[3].split("?")[0];
      newVideoId = videoId || "";
    }
  } else if (videoUrl?.includes("music.youtube.com")) {
    if (videoUrl.includes("watch")) {
      newVideoId = videoUrl.split("watch?v=")[1] || "";
      newVideoId = newVideoId.split("&")[0];
    }
  }
  return newVideoId;
}

export default function OverlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const target = new BufferTarget();
  const format = new Mp4OutputFormat();
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentTimeRef = useRef<HTMLInputElement>(null);

  const {
    verticalPosition,
    setVerticalPosition,
    sizeMultiplier,
    setSizeMultiplier,
    lyricOffset,
    setLyricOffset,
    currentTime,
    setCurrentTime,
    isPlaying,
    setIsPlaying,
    isLoading,
    setIsLoading,
    outputUrl,
    setOutputUrl,
    jsonData,
    setJsonData,
    videoDimensions,
    setVideoDimensions,
    previewUrl,
    setPreviewUrl,
    loadedVideoId,
    setLoadedVideoId,
    customSrt,
    setCustomSrt,
    file,
    setFile,
  } = useOverlayStore();

  const output = new Output({
    target: target,
    format: format,
  });

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.addEventListener("play", () =>
        setIsPlaying(true)
      );
      previewVideoRef.current.addEventListener("pause", () =>
        setIsPlaying(false)
      );
    }
  }, [previewVideoRef]);

  async function handleUpload() {
    if (!file) {
      alert("No file selected");
      return;
    }
    if (isLoading) {
      alert("Already loading");
      return;
    }
    const parsedSubtitles = parseSrt(customSrt);
    console.log("Starting conversion");
    setIsLoading(true);
    const watermark = new Image();
    watermark.src = "/watermark.png";
    await new Promise((resolve) => {
      watermark.onload = resolve;
    });

    const blob = new Blob([file ?? ""], { type: file?.type ?? "" });
    const blobSource = new BlobSource(blob);
    const input = new Input({ source: blobSource, formats: ALL_FORMATS });

    const ctx:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null = null;
    const conversion = await convertCanvas(
      verticalPosition,
      sizeMultiplier,
      input,
      output,
      parsedSubtitles,
      ctx,
      lyricOffset
    );

    await conversion?.execute().catch((error) => {
      alert("Error converting file");
      console.error(error);
      setIsLoading(false);
    });
    console.log("Conversion complete");

    const buffer = target.buffer as ArrayBuffer;
    const outputMimeType = file?.type?.startsWith("video/")
      ? file.type
      : "video/mp4";
    const outputBlob = new Blob([buffer], { type: outputMimeType });
    console.log("outputBlob", outputBlob);
    const url = URL.createObjectURL(outputBlob);
    setIsLoading(false);

    // Save output url in state for react video element
    setOutputUrl(url);

    // Also, if ref available, force reload and play
    if (videoRef.current) {
      console.log("Setting video source");
      videoRef.current.src = url;
      // Wait until metadata is loaded, then play to fix load timing issues
      videoRef.current.onloadedmetadata = () => {
        console.log("Metadata loaded");
        videoRef.current?.play();
      };
      videoRef.current.load(); // triggers metadata load
    }
    console.log("Output URL set");
  }

  function handleDownload() {
    if (!outputUrl) {
      alert("No output URL");
      return;
    }
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = "output.mp4";
    a.click();
  }

  function handleQuickPreview() {
    if (!file) {
      alert("Please select a video file first");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    setTimeout(() => {
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = currentTime;
        previewVideoRef.current.onloadeddata = () => {
          drawVideoFrameWithOverlay();
        };
      }
    }, 100);
  }

  function drawVideoFrameWithOverlay() {
    if (!canvasRef.current || !previewVideoRef.current) return;

    const canvas = canvasRef.current;
    const video = previewVideoRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const parsedSubtitles = parseSrt(customSrt);
    const validSubtitles = parsedSubtitles.filter(
      (sub): sub is typeof sub & { startTime: number; endTime: number } =>
        sub.startTime !== null && sub.endTime !== null
    );

    const subtitle = validSubtitles.find(
      (sub) =>
        currentTime + lyricOffset >= sub.startTime &&
        currentTime + lyricOffset <= sub.endTime
    );

    if (subtitle) {
      const cantonese = subtitle.text
        .split("(yue)")[1]
        ?.split("(en)")[0]
        ?.trim();
      const english = subtitle.text.split("(en)")[1]?.trim();

      if (cantonese) {
        const transliteratedText = transliterateCaptions(cantonese, true, {});
        const transliterationMap = retrieveChineseRomanizationMap(
          transliteratedText,
          cantonese
        );
        const rows = updateTransliterationRows(transliterationMap);

        const rendererSizeMultiplier = sizeMultiplier / 2;
        const cellSize = (defaultCellSize * sizeMultiplier) / 2 - 5;
        const rowSpacing = 0;
        const topMargin = verticalPosition;
        const spacingBetweenTextAndChars = 20;

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
            englishY +
            totalTextHeight +
            paddingY * 2 +
            spacingBetweenTextAndChars;
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
                rendererSizeMultiplier,
                false
              );
              currentX += cellSize;
            }
          }
        }
      }
    }
  }

  useEffect(() => {
    if (currentTimeRef.current && !isPlaying) {
      console.log(
        `current time ${currentTime} | vertical position ${verticalPosition} | default cell size ${defaultCellSize} | size multiplier ${sizeMultiplier}`
      );
      const time = Number.parseFloat(currentTimeRef.current.value);
      handleDrawCanvas(
        canvasRef as React.RefObject<HTMLCanvasElement>,
        time + lyricOffset,
        verticalPosition,
        sizeMultiplier,
        setJsonData,
        videoDimensions,
        customSrt
      );
    }
  }, [currentTime, verticalPosition, sizeMultiplier, isPlaying, lyricOffset]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  async function handleLoadVideo() {
    if (!loadedVideoId) {
      alert("No video ID");
      return;
    }
    const videoId = getVideoIdFromUrl(loadedVideoId);
    const customSubtitlesResponse = await fetch(
      `https://www.langpal.com.hk/api/subtitles`,
      {
        method: "POST",
        body: JSON.stringify({ youtube_id: videoId, retrieve_backup: true }),
      }
    );
    if (!customSubtitlesResponse.ok) {
      alert("Failed to load video subtitles");
      return;
    }
    const customSubtitles = await customSubtitlesResponse.text();
    setCustomSrt(customSubtitles);
  }

  return (
    <div className="w-full h-fit min-h-screen z-100 flex-col font-sans mt-24 flex items-center text-white">
      <h1>Overlay Test</h1>

      <div className="flex gap-2 w-120 h-8 my-4">
        <input
          type="text"
          className="w-full rounded-2xl p-2 text-black"
          value={loadedVideoId || ""}
          onChange={(e) => setLoadedVideoId(e.target.value)}
        />
        <button
          type="button"
          className="bg-blue-600 w-auto hover:bg-blue-700 rounded-2xl p-2 font-semibold"
          onClick={handleLoadVideo}
        >
          Load
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <button
          className="bg-blue-600 hover:bg-blue-700 rounded-2xl p-2 font-semibold"
          type="button"
          onClick={handleQuickPreview}
        >
          Quick Preview
        </button>
        <button
          className="bg-black rounded-2xl p-2"
          type="button"
          onClick={() =>
            handleDrawCanvas(
              canvasRef as React.RefObject<HTMLCanvasElement>,
              currentTime,
              verticalPosition,
              defaultCellSize,
              setJsonData,
              videoDimensions,
              customSrt
            )
          }
        >
          Draw Canvas (With Video)
        </button>
      </div>

      <div className="flex flex-col gap-2 w-[40rem]">
        <p className="text-sm">Size Multiplier: {sizeMultiplier}x</p>
        <input
          className="w-full"
          type="range"
          min={0.1}
          max={10}
          step={0.1}
          value={sizeMultiplier}
          onChange={(e) => {
            setSizeMultiplier(Number.parseFloat(e.target.value));
          }}
        />
        <p className="text-sm">Lyric Offset: {lyricOffset}s </p>
        <input
          className="w-full"
          type="range"
          step={0.5}
          min={-100}
          max={100}
          value={lyricOffset}
          onChange={(e) => {
            const newValue = Number.parseFloat(e.target.value);
            setLyricOffset(newValue);
          }}
        />
      </div>

      <div className="flex gap-4 flex-row justify-center items-center relative">
        <div className="flex flex-col gap-2 relative justify-center items-center w-[50rem] h-[30rem] rounded-2xl drop-shadow-md border-2 border-white">
          <video
            ref={previewVideoRef}
            className="absolute top-0 left-0 w-auto h-[30rem] self-center justify-self-center anchor-center"
            src={previewUrl || undefined}
            crossOrigin="anonymous"
            controls
          >
            <track kind="captions" src={undefined} />
          </video>
          <canvas
            className="absolute top-0 left-0 w-auto h-[30rem] self-center justify-self-center anchor-center"
            ref={canvasRef}
          />
          <div className="flex flex-col gap-2 w-full absolute bottom-0">
            <p className="text-sm">Time Position: {currentTime}s </p>
            <input
              className="w-full"
              type="range"
              min={0}
              max={174}
              ref={currentTimeRef}
              value={currentTime}
              onChange={(e) => {
                const newValue = Number.parseInt(e.target.value);
                setCurrentTime(newValue);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 rotate-90 absolute right-[-35%] w-[60%]">
          <p className="text-sm">
            Vertical Position (Y-Axis): {verticalPosition}px
          </p>
          <input
            className="w-full"
            type="range"
            min={0}
            max={3000}
            value={verticalPosition}
            onChange={(e) => {
              setVerticalPosition(Number.parseInt(e.target.value));
            }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-4 items-center mt-6">
        <input
          type="file"
          accept="video/*"
          className="text-white"
          onChange={(e) => {
            console.log("File changed");
            const selectedFile = e.target.files?.[0];

            if (previewUrl) {
              URL.revokeObjectURL(previewUrl);
            }

            if (!selectedFile) {
              setFile(null);
              setPreviewUrl(null);
              setVideoDimensions({ width: 1920, height: 1080 });
              return;
            }

            setFile(selectedFile);
            const url = URL.createObjectURL(selectedFile);
            setPreviewUrl(url);

            const videoElement = document.createElement("video");
            videoElement.src = url;
            videoElement.onloadedmetadata = () => {
              setVideoDimensions({
                width: videoElement.videoWidth,
                height: videoElement.videoHeight,
              });
              URL.revokeObjectURL(videoElement.src);
              console.log("File set");
              alert(videoDimensions.width + " " + videoDimensions.height);
            };
            videoElement.load();
          }}
        />
        <div className="flex gap-4">
          <button
            disabled={!previewUrl}
            className="bg-blue-600 hover:bg-blue-700 rounded-2xl p-2 font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
            type="button"
            onClick={() => {
              if (previewVideoRef.current) {
                if (isPlaying) {
                  previewVideoRef.current.pause();
                } else {
                  previewVideoRef.current.play();
                }
              }
            }}
          >
            {isPlaying ? "Pause Preview" : "Play Preview"}
          </button>
          <button
            className="bg-green-600 hover:bg-green-700 rounded-2xl p-2 font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
            type="button"
            onClick={handleUpload}
            disabled={isLoading || !file}
          >
            {isLoading ? "Processing..." : "Process Full Video"}
          </button>
          <button
            type="button"
            className="bg-purple-600 hover:bg-purple-700 rounded-2xl p-2 font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
            onClick={handleDownload}
            disabled={!outputUrl}
          >
            Download
          </button>
        </div>
      </div>

      <div className="h-[40rem] m-6 w-auto rounded-2xl drop-shadow-md">
        {outputUrl && (
          <video className="w-full h-full rounded-2xl" ref={videoRef} controls>
            <track kind="captions" src={undefined} />
          </video>
        )}
      </div>
    </div>
  );
}
