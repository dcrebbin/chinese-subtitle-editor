"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  PauseCircleIcon,
  PencilIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { ALL_FORMATS, BlobSource, BufferTarget, Input, Mp4OutputFormat, Output } from "mediabunny";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";
import { setSessionState, useSessionStore } from "@/app/store/session.store";
import { defaultCellSize } from "../../utilities/constants";
import {
  convertCanvas,
  drawCharacterCell,
  handleDrawCanvas,
  scaleBackgroundImageOffsetY,
  updateTransliterationRows,
} from "../../utilities/rendering";
import { getSubtitleAtTime, parseSrt, transliterateCaptions } from "../../utilities/srt";
import { retrieveChineseRomanizationMap } from "../../utilities/transliteration/transliteration";
import Loading from "../common/loading";
import VideoTabs from "./video-tabs";

export async function retrieveCustomSubtitles(videoId: string) {
  const customSubtitlesResponse = await fetch("/api/subtitles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ youtube_id: videoId, retrieve_backup: true }),
  });
  if (!customSubtitlesResponse.ok) {
    alert("Failed to load video subtitles");
    return;
  }
  const customSubtitles = await customSubtitlesResponse.text();
  if (!customSubtitles) {
    alert("Failed to load video subtitles");
    return;
  }
  return customSubtitles;
}

declare global {
  interface Window {
    electron?: {
      downloadVideo?: (videoId: string) => Promise<ArrayBuffer>;
    };
  }
}

function formatTime(time: number) {
  const minutes = Math.floor((time % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");
  const milliseconds = Math.floor((time % 1) * 100)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}.${milliseconds}`;
}

export function getVideoIdFromUrl(videoUrl: string) {
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
  const currentTimeRef = useRef<HTMLInputElement>(null);
  const { session, setSession } = useSessionStore();
  const inputFileRef = useRef<HTMLInputElement>(null);
  const backgroundPreviewRef = useRef<HTMLDivElement>(null);
  const hasAttemptedAutoDownload = useRef(false);
  const { overlay } = useOverlayStore();
  const [previewHeight, setPreviewHeight] = useState(0);
  const output = new Output({
    target: target,
    format: format,
  });

  async function handleUpload() {
    if (!overlay.file) {
      alert("No file selected");
      return;
    }
    if (overlay.isLoading) {
      alert("Already loading");
      return;
    }
    const parsedSubtitles = parseSrt(session.srtContent);
    console.log("Starting conversion");
    setOverlayState({ isLoading: true });
    const blob = new Blob([overlay.file ?? ""], {
      type: overlay.file?.type ?? "",
    });
    const blobSource = new BlobSource(blob);
    const input = new Input({ source: blobSource, formats: ALL_FORMATS });

    const ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
    const conversion = await convertCanvas(
      overlay.verticalPosition,
      overlay.sizeMultiplier,
      input,
      output,
      parsedSubtitles,
      ctx,
      overlay.lyricOffset,
    );

    await conversion?.execute().catch((error) => {
      alert("Error converting file");
      console.error(error);
      setOverlayState({ isLoading: false });
    });
    console.log("Conversion complete");

    const buffer = target.buffer as ArrayBuffer;
    const outputMimeType = overlay.file?.type?.startsWith("video/")
      ? overlay.file.type
      : "video/mp4";
    const outputBlob = new Blob([buffer], { type: outputMimeType });
    console.log("outputBlob", outputBlob);
    const url = URL.createObjectURL(outputBlob);
    setOverlayState({ selectedTab: "render", outputUrl: url, isLoading: false });
  }

  useEffect(() => {
    if (videoRef.current) {
      console.log("Setting video source");
      videoRef.current.src = overlay.outputUrl || "";
      videoRef.current.onloadedmetadata = () => {
        console.log("Metadata loaded");
        videoRef.current?.play();
      };
      videoRef.current.load();
    }
  }, [overlay.outputUrl]);

  useEffect(() => {
    const element = backgroundPreviewRef.current;
    if (!element) {
      return;
    }

    const updatePreviewHeight = () => {
      setPreviewHeight(element.clientHeight);
    };

    updatePreviewHeight();

    const resizeObserver = new ResizeObserver(updatePreviewHeight);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [overlay.selectedTab, overlay.isLandscapeMode]);

  const handleDownloadVideo = useCallback(async () => {
    if (!overlay.downloadVideoId) {
      alert("No video ID");
      return;
    }
    setOverlayState({ videoIsDownloading: true });
    const videoId = overlay.downloadVideoId.includes("https://www.youtube.com/watch?v=")
      ? getVideoIdFromUrl(overlay.downloadVideoId)
      : overlay.downloadVideoId;

    try {
      const electronVideo = await window.electron?.downloadVideo?.(videoId);
      let blob: Blob;
      if (electronVideo) {
        blob = new Blob([electronVideo], { type: "video/mp4" });
      } else {
        const response = await fetch("/api/download", {
          method: "POST",
          body: JSON.stringify({ videoId: videoId }),
        });

        if (!response.ok) {
          alert("Failed to download video");
          return;
        }

        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      setOverlayState({
        previewUrl: url,
        file: new File([blob], "downloaded.mp4", { type: "video/mp4" }),
      });

      if (previewVideoRef.current) {
        previewVideoRef.current.src = url;
        // Wait until metadata is loaded, then play to fix potential load timing issues
        previewVideoRef.current.onloadedmetadata = () => {
          previewVideoRef.current?.play();
          setOverlayState({
            videoLength: previewVideoRef.current?.duration || 0,
            startTime: 0,
            endTime: previewVideoRef.current?.duration || 0,
          });
        };
        previewVideoRef.current.load();
      }
    } catch (error) {
      console.error("Error processing downloaded video:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`An error occurred while processing the downloaded video.\n\n${message}`);
    } finally {
      setOverlayState({ videoIsDownloading: false });
    }
  }, [overlay.downloadVideoId]);

  useEffect(() => {
    if (hasAttemptedAutoDownload.current) {
      return;
    }
    if (!overlay.downloadVideoId?.trim() || overlay.previewUrl) {
      return;
    }

    hasAttemptedAutoDownload.current = true;
    void handleDownloadVideo();
  }, [overlay.downloadVideoId, overlay.previewUrl, handleDownloadVideo]);

  function handleDownload() {
    if (!overlay.outputUrl) {
      alert("No output URL");
      return;
    }
    const a = document.createElement("a");
    a.href = overlay.outputUrl;
    a.download = "output.mp4";
    a.click();
  }

  useEffect(() => {
    if (currentTimeRef.current && !overlay.isPlaying) {
      const time = Number.parseFloat(currentTimeRef.current.value);
      setOverlayState({ currentTime: time + overlay.lyricOffset });
      const currentSubtitle = getSubtitleAtTime(
        session.parsedSubtitles,
        time + overlay.lyricOffset,
      );
      handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        currentSubtitle ?? null,
        time + overlay.lyricOffset,
      );
    }
  }, [
    overlay.currentTime,
    overlay.verticalPosition,
    overlay.sizeMultiplier,
    overlay.isPlaying,
    overlay.lyricOffset,
    session.parsedSubtitles,
  ]);

  async function handleLoadVideo() {
    if (!overlay.loadedVideoId || overlay.loadedVideoId === "") {
      alert("No video ID");
      return;
    }
    setSessionState({
      ...session,
      isLoading: true,
    });
    const videoId = overlay.loadedVideoId.includes("https://www.youtube.com/watch?v=")
      ? getVideoIdFromUrl(overlay.loadedVideoId)
      : overlay.loadedVideoId;
    const customSubtitles = await retrieveCustomSubtitles(videoId);
    if (!customSubtitles) {
      alert("Failed to load video subtitles");
      return;
    }
    setSession({
      ...session,
      srtContent: customSubtitles,
      originalSrtContent: customSubtitles,
    });
  }

  const updatePreviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function startUpdatePreview() {
    if (!previewVideoRef.current) return;
    updatePreviewTimeoutRef.current = setTimeout(() => {
      const currentSubtitle = getSubtitleAtTime(
        session.parsedSubtitles,
        previewVideoRef.current?.currentTime ?? 0,
      );
      handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        currentSubtitle,
        previewVideoRef.current?.currentTime ?? 0,
      );
      startUpdatePreview();
    }, 100);
  }

  function stopUpdatePreview() {
    if (updatePreviewTimeoutRef.current) {
      console.log("Clearing update preview timeout");
      clearTimeout(updatePreviewTimeoutRef.current);
    }
  }

  const scaledBackgroundOffsetY = scaleBackgroundImageOffsetY(
    overlay.backgroundImageOffsetY,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const backgroundPosition = overlay.isLandscapeMode
    ? `center calc(50% + ${scaledBackgroundOffsetY}px)`
    : `center ${scaledBackgroundOffsetY}px`;

  const videoOverlayContent = (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="my-4 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="flex w-full min-w-0 gap-2 sm:flex-1">
          <input
            type="text"
            className="min-w-0 flex-1 rounded-2xl bg-white p-2 text-black"
            value={overlay.downloadVideoId || ""}
            onChange={(e) => {
              setOverlayState({ downloadVideoId: e.target.value });
            }}
          />
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700"
            onClick={handleDownloadVideo}
            disabled={overlay.downloadVideoId === ""}
          >
            Download
          </button>
        </div>
        <div className="flex w-full min-w-0 gap-2 sm:flex-1">
          <input
            type="text"
            className="min-w-0 flex-1 rounded-2xl bg-white p-2 text-black"
            value={overlay.loadedVideoId || ""}
            onChange={(e) => {
              setOverlayState({ loadedVideoId: e.target.value });
            }}
          />
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700"
            onClick={handleLoadVideo}
            disabled={overlay.loadedVideoId === ""}
          >
            Load
          </button>
        </div>
      </div>
      <div className="mb-4 flex w-full flex-col flex-wrap gap-2 sm:flex-row sm:gap-4">
        <button
          className="cursor-pointer rounded-2xl bg-black p-2 hover:bg-gray-800"
          type="button"
          onClick={() => {
            setOverlayState({ isLandscapeMode: !overlay.isLandscapeMode });
            if (canvasRef.current && videoRef.current) {
              if (overlay.isLandscapeMode) {
                canvasRef.current.width = 1080;
                canvasRef.current.height = 1920;
                videoRef.current.style.width = "100%";
              } else {
                canvasRef.current.width = 1920;
                canvasRef.current.height = 1080;
                videoRef.current.style.width = "100%";
              }
            }
          }}
        >
          {overlay.isLandscapeMode ? "Portrait Mode" : "Landscape Mode"}
        </button>
        <select
          className="w-fit rounded-2xl bg-white p-2 text-black"
          value={overlay.backgroundMode}
          onChange={(e) => {
            setOverlayState({
              backgroundMode: e.target.value as "colour" | "full-image" | "double-image",
            });
          }}
        >
          <option value="colour">Colour</option>
          <option value="full-image">Full Image</option>
        </select>
        {overlay.backgroundMode === "colour" && (
          <input
            type="color"
            className="h-10 w-32 cursor-pointer rounded-2xl bg-white p-1 text-black"
            value={overlay.colour || "#000000"}
            onChange={(e) => {
              setOverlayState({ colour: e.target.value });
            }}
          />
        )}
        {!overlay.isLandscapeMode && (
          <select
            className="w-fit rounded-2xl bg-white p-2 text-black"
            value={overlay.videoPosition || "center"}
            onChange={(e) => {
              setOverlayState({ videoPosition: e.target.value as "top" | "center" | "bottom" });
            }}
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
          </select>
        )}
      </div>
      <div className="flex w-full flex-col gap-2">
        <p className="text-sm">Size Multiplier: {overlay.sizeMultiplier}x</p>
        <input
          className="w-full"
          type="range"
          min={0.1}
          max={10}
          step={0.1}
          value={overlay.sizeMultiplier}
          onChange={(e) => {
            setOverlayState({
              sizeMultiplier: Number.parseFloat(e.target.value),
            });
          }}
        />
      </div>
      <div
        className="relative mx-0 flex w-full max-w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-white drop-shadow-md sm:mx-4"
        style={{
          display: overlay.selectedTab === "editor" ? "flex" : "none",
        }}
      >
        <div
          className={`relative w-full overflow-hidden rounded-2xl border-2 border-white ${
            overlay.isLandscapeMode
              ? "aspect-video max-w-full xl:max-w-[56rem]"
              : "aspect-[9/16] max-w-[min(100%,22rem)] xl:max-w-[22rem]"
          }`}
        >
          <div
            ref={backgroundPreviewRef}
            className="absolute h-full w-full"
            style={{
              backgroundSize: "cover",
              backgroundPosition,
              backgroundRepeat: "no-repeat",
              backgroundImage:
                overlay.backgroundMode === "full-image"
                  ? `url(${overlay.backgroundImage})`
                  : "none",
              backgroundColor:
                overlay.backgroundMode === "colour" ? overlay.colour || "#000000" : "transparent",
            }}
          >
            <video
              ref={previewVideoRef}
              style={{
                display: overlay.previewUrl ? "block" : "none",
                placeSelf: overlay.videoPosition === "center" ? "anchor-center" : "auto",
                width: "100%",
                maxWidth: "100%",
                marginTop: overlay.videoPosition === "top" ? "0" : "50%",
              }}
              preload="auto"
              className="absolute top-0 left-0 h-auto w-auto self-center justify-self-center"
              src={overlay.previewUrl || undefined}
              crossOrigin="anonymous"
              onPause={() => {
                setOverlayState({ isPlaying: false });
                stopUpdatePreview();
              }}
              onPlay={() => {
                setOverlayState({ isPlaying: true });
                startUpdatePreview();
              }}
              onTimeUpdate={() => {
                setOverlayState({ currentTime: previewVideoRef.current?.currentTime ?? 0 });
              }}
            >
              <track kind="captions" src={undefined} />
            </video>
          </div>
          <canvas
            style={{
              placeSelf: "anchor-center",
            }}
            className="anchor-center pointer-events-none absolute top-0 left-0 h-full w-full self-center justify-self-center"
            ref={canvasRef}
          />
        </div>
        <div className="absolute bottom-0 flex w-full flex-row justify-start gap-2">
          <div className="pointer-events-none flex w-full flex-col gap-2 pt-20">
            <div className="flex flex-row justify-start gap-2">
              <p className="w-full max-w-xs rounded-2xl bg-black/80 p-2 text-base font-bold sm:w-52 sm:p-4 sm:text-xl">
                Time: {formatTime(overlay.currentTime)}s{" "}
              </p>
              <button
                disabled={!overlay.previewUrl}
                className="pointer-events-auto cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
                type="button"
                onClick={() => {
                  if (previewVideoRef.current) {
                    if (overlay.isPlaying) {
                      setOverlayState({ isPlaying: false });
                      previewVideoRef.current.pause();
                    } else {
                      setOverlayState({ isPlaying: true });
                      previewVideoRef.current.play();
                    }
                  }
                }}
              >
                {overlay.isPlaying ? (
                  <PauseCircleIcon className="h-6 w-10" />
                ) : (
                  <PlayIcon className="h-6 w-10" />
                )}
              </button>
            </div>
            <input
              className="pointer-events-auto w-full cursor-pointer"
              type="range"
              min={0}
              step={0.1}
              max={overlay.videoLength}
              ref={currentTimeRef}
              value={overlay.currentTime}
              onChange={(e) => {
                const newValue = Number.parseFloat(e.target.value);
                setOverlayState({ currentTime: newValue });
                if (previewVideoRef.current) {
                  previewVideoRef.current.currentTime = newValue;
                }
              }}
            />
          </div>
        </div>
        <div className="absolute top-0 left-0 flex justify-start">
          <button
            type="button"
            className="m-2 flex w-42 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={() => inputFileRef.current?.click()}
          >
            <p className="text-sm font-bold">Upload Video</p>
            <ArrowUpCircleIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="m-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={() => {
              setOverlayState({
                selectedTab: overlay.selectedTab === "editor" ? "render" : "editor",
              });
            }}
          >
            <p className="text-sm font-bold">Render</p>
            <PlayIcon className="h-6 w-6" />
          </button>
        </div>
        {overlay.backgroundMode === "full-image" && (
          <div>
            <p
              className="absolute top-1/3 right-10 hidden text-xs whitespace-nowrap sm:block"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              Background Y Offset: {overlay.backgroundImageOffsetY}px
            </p>
            <div className="absolute top-1/2 right-14 hidden h-[50%] w-6 -translate-y-1/2 flex-col items-center justify-center gap-2 sm:flex">
              <input
                className="vertical-slider h-6 w-156 cursor-pointer"
                style={{
                  transform: "rotate(90deg)",
                  accentColor: "#3182ce",
                  marginTop: "100px",
                  marginBottom: "100px",
                }}
                type="range"
                min={0}
                max={3000}
                step={1}
                value={overlay.backgroundImageOffsetY}
                onChange={(e) => {
                  setOverlayState({
                    backgroundImageOffsetY: Number.parseInt(e.target.value),
                  });
                }}
              />
            </div>
          </div>
        )}
        <div>
          <p
            className="absolute top-1/3 right-0 hidden text-xs whitespace-nowrap sm:block"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Vertical Position (Y): {overlay.verticalPosition}px
          </p>
          <div className="absolute top-1/2 right-4 hidden h-[50%] w-6 -translate-y-1/2 flex-col items-center justify-center gap-2 sm:flex">
            <input
              className="vertical-slider h-6 w-156 cursor-pointer"
              style={{
                transform: "rotate(90deg)",
                accentColor: "#3182ce",
                marginTop: "100px",
                marginBottom: "100px",
              }}
              type="range"
              min={0}
              max={3000}
              step={1}
              value={overlay.verticalPosition}
              onChange={(e) => {
                setOverlayState({
                  verticalPosition: Number.parseInt(e.target.value),
                });
              }}
            />
          </div>
        </div>
      </div>
      <div
        className="relative mx-0 flex w-full max-w-full flex-col items-center justify-start gap-2 rounded-2xl border-2 border-white drop-shadow-md sm:mx-4"
        style={{ display: overlay.selectedTab === "render" ? "flex" : "none" }}
      >
        <div className="absolute top-0 left-0 z-999 flex justify-start">
          <button
            type="button"
            className="m-2 flex w-42 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={handleDownload}
          >
            <p className="text-sm font-bold">Download Video</p>
            <ArrowDownCircleIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="m-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={() => {
              setOverlayState({
                selectedTab: overlay.selectedTab === "editor" ? "render" : "editor",
              });
            }}
          >
            <p className="text-sm font-bold">Editor</p>
            <PencilIcon className="h-6 w-6" />{" "}
          </button>
        </div>
        {overlay.outputUrl && (
          <video
            className="h-[35rem] w-full max-w-full rounded-2xl border-2 border-white"
            ref={videoRef}
            controls
          >
            <track kind="captions" src={undefined} />
          </video>
        )}
      </div>
      <div className="mt-6 flex flex-col items-center gap-4">
        <input
          ref={inputFileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            console.log("File changed");
            const selectedFile = e.target.files?.[0];

            if (overlay.previewUrl) {
              URL.revokeObjectURL(overlay.previewUrl);
            }

            if (!selectedFile) {
              setOverlayState({
                videoDimensions: { width: 1920, height: 1080 },
                file: null,
                previewUrl: null,
                videoLength: 100,
              });
              return;
            }

            const url = URL.createObjectURL(selectedFile);
            setOverlayState({ previewUrl: url, file: selectedFile });

            const videoElement = document.createElement("video");
            videoElement.src = url;

            videoElement.onloadedmetadata = () => {
              setOverlayState({
                videoLength: videoElement.duration,
                startTime: 0,
                endTime: videoElement.duration,
                videoDimensions: {
                  width: videoElement.videoWidth,
                  height: videoElement.videoHeight,
                },
              });
              setSession({
                ...session,
                video: previewVideoRef.current,
              });
              console.log("File set");
              videoElement.remove();
            };
          }}
        />
        <div className="flex w-full flex-col flex-wrap items-center justify-center gap-2 px-2 sm:flex-row sm:px-6">
          <div className="flex flex-row items-center justify-center gap-2">
            <p className="text-sm font-bold">{formatTime(overlay.startTime)}s</p>
            <button
              type="button"
              className="cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
              onClick={() => {
                setOverlayState({ startTime: overlay.currentTime });
              }}
            >
              <p className="text-sm font-bold">Set</p>
            </button>
          </div>
          <div className="flex flex-row items-center justify-center gap-2">
            <p className="text-sm font-bold">{formatTime(overlay.endTime)}s</p>
            <button
              type="button"
              className="cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
              onClick={() => {
                setOverlayState({ endTime: overlay.currentTime });
              }}
            >
              <p className="text-sm font-bold">Set</p>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            className="cursor-pointer rounded-2xl bg-green-600 p-2 font-semibold hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            type="button"
            onClick={handleUpload}
            disabled={overlay.isLoading || !overlay.file}
          >
            {overlay.isLoading ? "Processing..." : "Process Full Video"}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-2xl bg-red-600 p-2 font-semibold hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            onClick={() => setOverlayState({ previewUrl: null, file: null, videoLength: 100 })}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="z-20 flex h-full min-h-0 w-full flex-col items-center overflow-y-auto rounded-3xl border-2 border-white/50 bg-black/50 p-2 font-sans text-white backdrop-blur-xs xl:p-4">
      {overlay.isLoading || (overlay.videoIsDownloading && <Loading />)}
      {videoOverlayContent}
    </div>
  );
}
