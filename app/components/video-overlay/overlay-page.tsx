"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  FilmIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { ALL_FORMATS, BlobSource, BufferTarget, Input, Mp4OutputFormat, Output } from "mediabunny";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";
import { setSessionState, useSessionStore } from "@/app/store/session.store";
import {
  convertCanvas,
  handleDrawCanvas,
  scaleBackgroundImageOffsetY,
} from "../../utilities/rendering";
import { cropSrtContent, getSubtitleAtTime, parseSrt } from "../../utilities/srt";
import { cropVideoFile, getClampedVideoCrop } from "../../utilities/video-crop";
import { loadSrtFromLocalStorage } from "../../utilities/video-storage";
import Loading from "../common/loading";
import { Segmented } from "./inspector-controls";
import OverlayInspector from "./overlay-inspector";

const youtubeDownloadsEnabled = import.meta.env.VITE_DOWNLOAD_ENABLED === "true";

export async function retrieveCustomSubtitles(videoId: string) {
  const savedSubtitles = loadSrtFromLocalStorage(videoId);
  if (savedSubtitles !== null) {
    return savedSubtitles;
  }

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

  async function handleCropVideo() {
    if (!overlay.file) {
      alert("Upload or download a video first.");
      return;
    }

    const start = Math.max(0, Math.min(overlay.startTime, overlay.videoLength));
    const end = Math.min(overlay.videoLength, overlay.endTime);
    if (end <= start) {
      alert("Set an end time after the start time before cropping.");
      return;
    }

    setOverlayState({ isLoading: true, isPlaying: false });
    try {
      previewVideoRef.current?.pause();
      const croppedFile = await cropVideoFile(overlay.file, start, end);
      const croppedUrl = URL.createObjectURL(croppedFile);
      const oldUrl = overlay.previewUrl;

      const metadata = await new Promise<{
        duration: number;
        width: number;
        height: number;
      }>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
          video.remove();
        };
        video.onerror = () => {
          reject(new Error("The cropped video could not be loaded."));
          video.remove();
        };
        video.src = croppedUrl;
      });

      setOverlayState({
        file: croppedFile,
        previewUrl: croppedUrl,
        videoLength: metadata.duration,
        startTime: 0,
        endTime: metadata.duration,
        currentTime: 0,
        videoDimensions: { width: metadata.width, height: metadata.height },
        videoScale: 1,
        videoCropLeft: 0,
        videoCropRight: 0,
        videoCropTop: 0,
        videoCropBottom: 0,
        outputUrl: null,
      });
      setSessionState({
        srtContent: cropSrtContent(session.srtContent, start, end),
        originalSrtContent: cropSrtContent(session.srtContent, start, end),
      });
      if (oldUrl && oldUrl !== croppedUrl) {
        URL.revokeObjectURL(oldUrl);
      }
    } catch (error) {
      console.error("Error cropping video:", error);
      alert(error instanceof Error ? error.message : "Failed to crop video.");
    } finally {
      setOverlayState({ isLoading: false });
    }
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
      setSessionState({ videoId });

      if (previewVideoRef.current) {
        previewVideoRef.current.src = url;
        previewVideoRef.current.onloadedmetadata = () => {
          const videoHeight = previewVideoRef.current?.videoHeight || 1;
          const videoCrop = getClampedVideoCrop(
            overlay.videoCropTop,
            overlay.videoCropBottom,
            videoHeight,
            overlay.videoCropLeft,
            overlay.videoCropRight,
            previewVideoRef.current?.videoWidth || 1,
          );
          setOverlayState({
            videoLength: previewVideoRef.current?.duration || 0,
            startTime: 0,
            endTime: previewVideoRef.current?.duration || 0,
            videoDimensions: {
              width: previewVideoRef.current?.videoWidth || 1,
              height: videoHeight,
            },
            videoCropTop: videoCrop.top,
            videoCropBottom: videoCrop.bottom,
            videoCropLeft: videoCrop.left,
            videoCropRight: videoCrop.right,
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
  }, [
    overlay.downloadVideoId,
    overlay.videoCropBottom,
    overlay.videoCropTop,
    overlay.videoCropLeft,
    overlay.videoCropRight,
  ]);

  useEffect(() => {
    if (!youtubeDownloadsEnabled) {
      return;
    }
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
      void handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        currentSubtitle ?? null,
        time + overlay.lyricOffset,
      );
    }
  }, [
    overlay.currentTime,
    overlay.verticalPosition,
    overlay.sizeMultiplier,
    overlay.flipSubtitleRows,
    overlay.separateTextSizes,
    overlay.sourceTextSize,
    overlay.romanizationTextSize,
    overlay.translationTextSize,
    overlay.transliterationEnabled,
    overlay.subtitleStyle,
    overlay.retroKaraokeLengthInfluence,
    overlay.retroKaraokeTimingOverrides,
    overlay.isPlaying,
    overlay.isLandscapeMode,
    overlay.selectedTab,
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
      setSessionState({ isLoading: false });
      alert("Failed to load video subtitles");
      return;
    }
    setSession({
      ...session,
      videoId,
      srtContent: customSubtitles,
      originalSrtContent: customSubtitles,
      isLoading: false,
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
      void handleDrawCanvas(
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
  const scaledBackgroundBlur = scaleBackgroundImageOffsetY(
    overlay.backgroundImageBlur,
    previewHeight,
    overlay.isLandscapeMode,
  );
  // Matches the oversized draw used by the canvas renderer so blurred edges stay covered
  const backgroundBlurBleed = scaledBackgroundBlur * 2;
  const backgroundPosition = overlay.isLandscapeMode
    ? `center calc(50% + ${scaledBackgroundOffsetY}px)`
    : `center ${scaledBackgroundOffsetY + backgroundBlurBleed}px`;
  const scaledTopBackgroundBlur = scaleBackgroundImageOffsetY(
    overlay.doubleBackgroundImageBlur.image1,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const scaledBottomBackgroundBlur = scaleBackgroundImageOffsetY(
    overlay.doubleBackgroundImageBlur.image2,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const scaledTopBackgroundOffsetY = scaleBackgroundImageOffsetY(
    overlay.doubleBackgroundImageOffsetY.image1,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const scaledBottomBackgroundOffsetY = scaleBackgroundImageOffsetY(
    overlay.doubleBackgroundImageOffsetY.image2,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const sourceVideoHeight = Math.max(1, overlay.videoDimensions.height);
  const videoCrop = getClampedVideoCrop(
    overlay.videoCropTop,
    overlay.videoCropBottom,
    sourceVideoHeight,
    overlay.videoCropLeft,
    overlay.videoCropRight,
    overlay.videoDimensions.width,
  );
  const videoCropTopPercent = (videoCrop.top / sourceVideoHeight) * 100;
  const videoCropBottomPercent = (videoCrop.bottom / sourceVideoHeight) * 100;
  const outputWidth = overlay.isLandscapeMode ? 1920 : 1080;
  const outputHeight = overlay.isLandscapeMode ? 1080 : 1920;
  const subtitlePositionY = Math.max(0, Math.min(outputHeight - 1, overlay.verticalPosition));

  useEffect(() => {
    if (overlay.verticalPosition !== subtitlePositionY) {
      setOverlayState({ verticalPosition: subtitlePositionY });
    }
  }, [overlay.verticalPosition, subtitlePositionY]);

  const sourceVideoWidth = Math.max(1, overlay.videoDimensions.width);
  const previewVideoScale = Math.min(
    outputWidth / sourceVideoWidth,
    outputHeight / sourceVideoHeight,
  );
  const userVideoScale = overlay.videoScale || 1;
  const previewVideoWidthPercent =
    ((sourceVideoWidth * previewVideoScale) / outputWidth) * 100 * userVideoScale;
  const fitVideoHeightPercent = ((sourceVideoHeight * previewVideoScale) / outputHeight) * 100;
  const previewVideoHeightPercent = fitVideoHeightPercent * userVideoScale;
  const previewVideoTopPercent =
    (overlay.videoPosition === "center" ? (100 - fitVideoHeightPercent) / 2 : 0) -
    (previewVideoHeightPercent - fitVideoHeightPercent) / 2 +
    (overlay.videoOffsetY / outputHeight) * 100;

  const hasVideo = Boolean(overlay.previewUrl);
  const inPercent = (overlay.startTime / Math.max(overlay.videoLength, 0.001)) * 100;
  const outPercent = (overlay.endTime / Math.max(overlay.videoLength, 0.001)) * 100;

  function setLandscapeMode(isLandscapeMode: boolean) {
    if (isLandscapeMode === overlay.isLandscapeMode) {
      return;
    }
    setOverlayState({ isLandscapeMode });
  }

  function togglePlayback() {
    if (!previewVideoRef.current) {
      return;
    }
    if (overlay.isPlaying) {
      setOverlayState({ isPlaying: false });
      previewVideoRef.current.pause();
    } else {
      setOverlayState({ isPlaying: true });
      void previewVideoRef.current.play();
    }
  }

  const toolbarButtonClassName =
    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-medium hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40";
  const textFieldClassName =
    "min-w-0 flex-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm placeholder:text-white/40 outline-none focus:bg-white/15";

  const sourceBar = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button
        type="button"
        className={toolbarButtonClassName}
        onClick={() => inputFileRef.current?.click()}
      >
        <ArrowUpTrayIcon className="h-4 w-4" />
        Upload
      </button>
      {hasVideo && (
        <button
          type="button"
          className={toolbarButtonClassName}
          title="Remove video"
          onClick={() => setOverlayState({ previewUrl: null, file: null, videoLength: 100 })}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      )}
      <div className="flex min-w-48 flex-1 items-center gap-2">
        <input
          type="text"
          className={textFieldClassName}
          placeholder="YouTube ID or link"
          value={overlay.loadedVideoId || ""}
          onChange={(e) => {
            hasAttemptedAutoDownload.current = true;
            setOverlayState({
              loadedVideoId: e.target.value,
              ...(youtubeDownloadsEnabled ? { downloadVideoId: e.target.value } : {}),
            });
          }}
        />
        <button
          type="button"
          className={toolbarButtonClassName}
          onClick={handleLoadVideo}
          disabled={!overlay.loadedVideoId}
          title="Load saved subtitles for this video"
        >
          Subtitles
        </button>
        {youtubeDownloadsEnabled && (
          <button
            type="button"
            className={toolbarButtonClassName}
            onClick={handleDownloadVideo}
            disabled={!overlay.downloadVideoId}
            title="Download this video from YouTube"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Video
          </button>
        )}
      </div>
      <Segmented
        value={overlay.isLandscapeMode ? "landscape" : "portrait"}
        options={[
          ["landscape", "16:9"],
          ["portrait", "9:16"],
        ]}
        onChange={(mode) => setLandscapeMode(mode === "landscape")}
      />
      <button
        type="button"
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
        onClick={handleUpload}
        disabled={overlay.isLoading || !overlay.file}
      >
        <FilmIcon className="h-4 w-4" />
        {overlay.isLoading ? "Rendering…" : "Render"}
      </button>
    </div>
  );

  const transportBar = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!hasVideo}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={togglePlayback}
          aria-label={overlay.isPlaying ? "Pause" : "Play"}
        >
          {overlay.isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>
        <span className="shrink-0 text-xs text-white/70 tabular-nums">
          {formatTime(overlay.currentTime)} / {formatTime(overlay.videoLength)}
        </span>
        <div className="relative flex min-w-0 flex-1 items-center">
          <div
            className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500/40"
            style={{
              left: `${Math.min(inPercent, outPercent)}%`,
              width: `${Math.max(0, outPercent - inPercent)}%`,
            }}
          />
          <input
            className="relative w-full cursor-pointer accent-white"
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
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          className="cursor-pointer rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
          onClick={() => setOverlayState({ startTime: overlay.currentTime })}
          title="Set In point to the playhead"
        >
          In <span className="text-white/60 tabular-nums">{formatTime(overlay.startTime)}</span>
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-md bg-white/10 px-2 py-1 hover:bg-white/20"
          onClick={() => setOverlayState({ endTime: overlay.currentTime })}
          title="Set Out point to the playhead"
        >
          Out <span className="text-white/60 tabular-nums">{formatTime(overlay.endTime)}</span>
        </button>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-md bg-white/10 px-2 py-1 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleCropVideo}
          disabled={overlay.isLoading || !overlay.file || overlay.endTime <= overlay.startTime}
          title="Cut the video and subtitles down to the In–Out range"
        >
          <ScissorsIcon className="h-3.5 w-3.5" />
          Trim to In–Out
        </button>
      </div>
    </div>
  );

  const videoOverlayContent = (
    <div className="@container flex h-full w-full flex-col gap-3">
      {sourceBar}
      <div className="flex w-full flex-col gap-3 @5xl:flex-row @5xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
          <div
            className="relative w-full flex-col items-center justify-center"
            style={{
              display: overlay.selectedTab === "editor" ? "flex" : "none",
            }}
          >
            <div
              className={`relative w-full shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/15 ${
                overlay.isLandscapeMode
                  ? "aspect-video max-w-full xl:max-w-[56rem]"
                  : "aspect-[9/16] max-w-[min(100%,22rem)] xl:max-w-[22rem]"
              }`}
            >
              <div
                ref={backgroundPreviewRef}
                className="absolute isolate h-full w-full"
                style={{
                  backgroundColor:
                    overlay.backgroundMode === "colour"
                      ? overlay.colour || "#000000"
                      : "transparent",
                }}
              >
                {overlay.backgroundMode === "full-image" && (
                  <div className="absolute inset-0 overflow-hidden">
                    <div
                      className="absolute"
                      style={{
                        inset: `-${backgroundBlurBleed}px`,
                        backgroundSize: "cover",
                        backgroundPosition,
                        backgroundRepeat: "no-repeat",
                        backgroundImage: overlay.backgroundImage
                          ? `url(${overlay.backgroundImage})`
                          : "none",
                        filter:
                          scaledBackgroundBlur > 0 ? `blur(${scaledBackgroundBlur}px)` : "none",
                      }}
                    />
                  </div>
                )}
                {overlay.backgroundMode === "double-image" && (
                  <>
                    <div
                      className="pointer-events-none absolute top-0 left-0 h-1/2 w-full overflow-hidden"
                      style={{ zIndex: overlay.doubleImageLayer === "over" ? 1 : undefined }}
                    >
                      <div
                        className="absolute bg-cover bg-center bg-no-repeat"
                        style={{
                          inset: `-${scaledTopBackgroundBlur * 2}px`,
                          backgroundImage: overlay.doubleBackgroundImage.image1
                            ? `url(${overlay.doubleBackgroundImage.image1})`
                            : "none",
                          backgroundPosition: `center calc(50% + ${scaledTopBackgroundOffsetY}px)`,
                          filter:
                            scaledTopBackgroundBlur > 0
                              ? `blur(${scaledTopBackgroundBlur}px)`
                              : "none",
                        }}
                      />
                    </div>
                    <div
                      className="pointer-events-none absolute bottom-0 left-0 h-1/2 w-full overflow-hidden"
                      style={{ zIndex: overlay.doubleImageLayer === "over" ? 1 : undefined }}
                    >
                      <div
                        className="absolute bg-cover bg-center bg-no-repeat"
                        style={{
                          inset: `-${scaledBottomBackgroundBlur * 2}px`,
                          backgroundImage: overlay.doubleBackgroundImage.image2
                            ? `url(${overlay.doubleBackgroundImage.image2})`
                            : "none",
                          backgroundPosition: `center calc(50% + ${scaledBottomBackgroundOffsetY}px)`,
                          filter:
                            scaledBottomBackgroundBlur > 0
                              ? `blur(${scaledBottomBackgroundBlur}px)`
                              : "none",
                        }}
                      />
                    </div>
                  </>
                )}
                <video
                  ref={previewVideoRef}
                  style={{
                    display: overlay.previewUrl ? "block" : "none",
                    top: `${previewVideoTopPercent}%`,
                    left: `${50 + (overlay.videoOffsetX / outputWidth) * 100}%`,
                    width: `${previewVideoWidthPercent}%`,
                    height: `${previewVideoHeightPercent}%`,
                    maxWidth: "none",
                    maxHeight: "none",
                    objectFit: "fill",
                    transform: "translateX(-50%)",
                    clipPath: `inset(${videoCropTopPercent}% ${(videoCrop.right / sourceVideoWidth) * 100}% ${videoCropBottomPercent}% ${(videoCrop.left / sourceVideoWidth) * 100}%)`,
                  }}
                  preload="auto"
                  className="absolute"
                  aria-label="Video preview"
                  src={overlay.previewUrl || undefined}
                  crossOrigin="anonymous"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    setOverlayState({
                      videoDimensions: { width: video.videoWidth, height: video.videoHeight },
                    });
                  }}
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
              <div className="group absolute inset-y-0 right-2 z-10 w-7 opacity-70 transition-opacity focus-within:opacity-100 hover:opacity-100">
                <label
                  htmlFor="subtitle-position-y"
                  className="absolute top-2 right-9 rounded-md bg-black/70 px-2 py-1 text-xs whitespace-nowrap text-white shadow-sm"
                >
                  Position Y
                </label>
                <input
                  id="subtitle-position-y"
                  type="range"
                  className="subtitle-position-slider absolute -top-1.5 left-0 h-[calc(100%+12px)] w-7 cursor-ns-resize"
                  style={{ writingMode: "vertical-lr", direction: "ltr" }}
                  aria-orientation="vertical"
                  aria-valuetext={`${subtitlePositionY} pixels from top`}
                  min={0}
                  max={outputHeight - 1}
                  step={1}
                  value={subtitlePositionY}
                  onChange={(event) =>
                    setOverlayState({ verticalPosition: event.target.valueAsNumber })
                  }
                />
                <output
                  htmlFor="subtitle-position-y"
                  className="pointer-events-none absolute right-9 -translate-y-1/2 rounded-md bg-black/70 px-2 py-1 text-xs whitespace-nowrap text-white tabular-nums opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                  style={{
                    top: `clamp(40px, ${(subtitlePositionY / (outputHeight - 1)) * 100}%, calc(100% - 14px))`,
                  }}
                >
                  {subtitlePositionY}px
                </output>
              </div>
            </div>
          </div>
          <div
            className="relative w-full flex-col gap-3"
            style={{ display: overlay.selectedTab === "render" ? "flex" : "none" }}
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className={toolbarButtonClassName}
                onClick={() => setOverlayState({ selectedTab: "editor" })}
              >
                <ArrowUturnLeftIcon className="h-4 w-4" />
                Back to editor
              </button>
              <button
                type="button"
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
                onClick={handleDownload}
                disabled={!overlay.outputUrl}
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Download MP4
              </button>
            </div>
            {overlay.outputUrl ? (
              <video
                className="relative z-0 max-h-[70vh] w-full max-w-full rounded-xl bg-black"
                ref={videoRef}
                controls
              >
                <track kind="captions" src={undefined} />
              </video>
            ) : (
              <p className="py-16 text-center text-sm text-white/50">
                Nothing rendered yet. Press Render to burn the subtitles into the video.
              </p>
            )}
          </div>
          <div
            className="w-full"
            style={{ display: overlay.selectedTab === "editor" ? "block" : "none" }}
          >
            {transportBar}
          </div>
          {overlay.selectedTab === "editor" && overlay.outputUrl && (
            <button
              type="button"
              className="cursor-pointer self-start text-xs text-white/60 underline-offset-2 hover:text-white hover:underline"
              onClick={() => setOverlayState({ selectedTab: "render" })}
            >
              View last render
            </button>
          )}
        </div>
        <div className="w-full shrink-0 @5xl:w-80">
          <OverlayInspector
            hasVideo={hasVideo}
            videoCrop={videoCrop}
            sourceVideoWidth={sourceVideoWidth}
            sourceVideoHeight={sourceVideoHeight}
          />
        </div>
      </div>
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
            const videoCrop = getClampedVideoCrop(
              overlay.videoCropTop,
              overlay.videoCropBottom,
              videoElement.videoHeight,
              overlay.videoCropLeft,
              overlay.videoCropRight,
              videoElement.videoWidth,
            );
            setOverlayState({
              videoLength: videoElement.duration,
              startTime: 0,
              endTime: videoElement.duration,
              videoDimensions: {
                width: videoElement.videoWidth,
                height: videoElement.videoHeight,
              },
              videoCropTop: videoCrop.top,
              videoCropBottom: videoCrop.bottom,
              videoCropLeft: videoCrop.left,
              videoCropRight: videoCrop.right,
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
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col items-center overflow-y-auto rounded-3xl border-2 border-white/50 bg-black/50 p-2 font-sans text-white backdrop-blur-xs xl:p-4">
      {(overlay.isLoading || overlay.videoIsDownloading) && <Loading />}
      {videoOverlayContent}
    </div>
  );
}
