"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  FilmIcon,
  PauseIcon,
  PlayIcon,
  ScissorsIcon,
} from "@heroicons/react/20/solid";
import { ALL_FORMATS, BlobSource, BufferTarget, Input, Mp4OutputFormat, Output } from "mediabunny";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";
import { setSessionState, useSessionStore } from "@/app/store/session.store";
import { convertCanvas, handleDrawCanvas } from "../../utilities/rendering";
import { getRetroKaraokeCueKey } from "../../utilities/retro-karaoke-timing";
import { cropSrtContent, getSubtitleAtTime, parseSrt } from "../../utilities/srt";
import { cropVideoFile, getClampedVideoCrop } from "../../utilities/video-crop";
import { loadSrtFromLocalStorage } from "../../utilities/video-storage";
import Loading from "../common/loading";
import BackgroundImageLayer from "./background-image-layer";
import { Segmented, toolbarButtonClassName } from "./inspector-controls";
import OverlayInspector from "./overlay-inspector";
import VideoCropControls from "./video-crop-controls";

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
      downloadVideo?: (
        videoId: string,
        existingOnly?: boolean,
      ) => Promise<{ data: Uint8Array<ArrayBuffer>; filePath: string } | null>;
      getVideoFilePath?: (file: File) => string;
      showVideoInFinder?: (filePath: string) => Promise<void>;
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
  const [isCropping, setIsCropping] = useState(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
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

  const handleDownloadVideo = useCallback(
    async (existingOnly = false) => {
      if (!overlay.downloadVideoId) {
        alert("No video ID");
        return;
      }
      setOverlayState({ videoIsDownloading: true });
      const videoId = overlay.downloadVideoId.includes("https://www.youtube.com/watch?v=")
        ? getVideoIdFromUrl(overlay.downloadVideoId)
        : overlay.downloadVideoId;

      try {
        const electronDownload = window.electron?.downloadVideo;
        const electronVideo = await electronDownload?.(videoId, existingOnly);
        if (electronDownload && existingOnly && !electronVideo) {
          return;
        }
        let blob: Blob;
        if (electronVideo) {
          blob = new Blob([electronVideo.data], { type: "video/mp4" });
        } else {
          const response = await fetch("/api/download", {
            method: "POST",
            body: JSON.stringify({ videoId, existingOnly }),
          });

          if (existingOnly && response.status === 404) {
            return;
          }

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
          videoSourcePath: electronVideo?.filePath || null,
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
    },
    [
      overlay.downloadVideoId,
      overlay.videoCropBottom,
      overlay.videoCropTop,
      overlay.videoCropLeft,
      overlay.videoCropRight,
    ],
  );

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
    void handleDownloadVideo(true);
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
    overlay.retroKaraokeSingingStarts,
    overlay.isPlaying,
    overlay.isLandscapeMode,
    overlay.selectedTab,
    overlay.lyricOffset,
    session.parsedSubtitles,
  ]);

  async function handleLoadVideo() {
    if (isLoadingSubtitles) return;
    if (!overlay.loadedVideoId || overlay.loadedVideoId === "") {
      alert("No video ID");
      return;
    }
    setIsLoadingSubtitles(true);
    setSessionState({ isLoading: true });
    const videoId = overlay.loadedVideoId.includes("https://www.youtube.com/watch?v=")
      ? getVideoIdFromUrl(overlay.loadedVideoId)
      : overlay.loadedVideoId;
    try {
      const customSubtitles = await retrieveCustomSubtitles(videoId);
      if (customSubtitles === undefined) return;
      setSessionState({
        videoId,
        srtContent: customSubtitles,
        originalSrtContent: customSubtitles,
      });
    } catch (error) {
      console.error("Error loading subtitles:", error);
      alert("Failed to load video subtitles. Please try again.");
    } finally {
      setIsLoadingSubtitles(false);
      setSessionState({ isLoading: false });
    }
  }

  const updatePreviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function startUpdatePreview() {
    if (!previewVideoRef.current) return;
    updatePreviewTimeoutRef.current = setTimeout(() => {
      const currentSubtitle = getSubtitleAtTime(
        session.parsedSubtitles,
        (previewVideoRef.current?.currentTime ?? 0) + overlay.lyricOffset,
      );
      void handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        currentSubtitle,
        (previewVideoRef.current?.currentTime ?? 0) + overlay.lyricOffset,
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
  // At 1.0× the visible crop spans the full output width, matching convertCanvas.
  const previewVideoScale = outputWidth / (sourceVideoWidth - videoCrop.left - videoCrop.right);
  const containVideoScale = Math.min(
    outputWidth / sourceVideoWidth,
    outputHeight / sourceVideoHeight,
  );
  const containVideoHeightPercent = ((sourceVideoHeight * containVideoScale) / outputHeight) * 100;
  const userVideoScale = overlay.videoScale || 1;
  const previewVideoWidthPercent =
    ((sourceVideoWidth * previewVideoScale) / outputWidth) * 100 * userVideoScale;
  const fitVideoHeightPercent = ((sourceVideoHeight * previewVideoScale) / outputHeight) * 100;
  const previewVideoHeightPercent = fitVideoHeightPercent * userVideoScale;
  const croppedFitHeightPercent =
    fitVideoHeightPercent * (1 - (videoCrop.top + videoCrop.bottom) / sourceVideoHeight);
  const croppedHeightPercent = croppedFitHeightPercent * userVideoScale;
  const videoAnchorTopPercent =
    overlay.videoPosition === "center"
      ? (100 - croppedFitHeightPercent) / 2
      : overlay.videoPosition === "bottom"
        ? 100 - croppedFitHeightPercent
        : 0;
  const previewVideoTopPercent =
    videoAnchorTopPercent -
    (croppedHeightPercent - croppedFitHeightPercent) / 2 -
    (videoCrop.top / sourceVideoHeight) * previewVideoHeightPercent +
    (overlay.videoOffsetY / outputHeight) * 100;
  // Fit the full source while cropping so every handle stays reachable, even when zoomed.
  const displayedVideoWidth = isCropping
    ? ((sourceVideoWidth * containVideoScale) / outputWidth) * 100
    : previewVideoWidthPercent;
  const displayedVideoHeight = isCropping ? containVideoHeightPercent : previewVideoHeightPercent;
  const displayedVideoTop = isCropping
    ? (100 - containVideoHeightPercent) / 2
    : previewVideoTopPercent;
  const displayedVideoCenter = isCropping
    ? 50
    : 50 +
      (((videoCrop.right - videoCrop.left) / sourceVideoWidth) * previewVideoWidthPercent) / 2 +
      (overlay.videoOffsetX / outputWidth) * 100;

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
      <div className="flex min-w-48 flex-1 items-center gap-2">
        <input
          data-native-undo
          type="text"
          className={textFieldClassName}
          placeholder="YouTube ID or link"
          disabled={isLoadingSubtitles || overlay.videoIsDownloading}
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
          className={`relative flex justify-center ${toolbarButtonClassName}`}
          onClick={handleLoadVideo}
          disabled={!overlay.loadedVideoId || isLoadingSubtitles}
          aria-busy={isLoadingSubtitles}
          title="Load saved subtitles for this video"
        >
          {isLoadingSubtitles && (
            <ArrowPathIcon className="absolute h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
          <span role="status">Subtitles</span>
        </button>
        {youtubeDownloadsEnabled && (
          <button
            type="button"
            className={`relative flex justify-center ${toolbarButtonClassName}`}
            onClick={() => void handleDownloadVideo()}
            disabled={!overlay.downloadVideoId || overlay.videoIsDownloading}
            aria-busy={overlay.videoIsDownloading}
            title="Download this video from YouTube"
          >
            {overlay.videoIsDownloading && (
              <ArrowPathIcon className="absolute h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
            <span role="status">Video</span>
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

  const activeKaraokeTime = overlay.currentTime + overlay.lyricOffset;
  const activeKaraokeCue = getSubtitleAtTime(session.parsedSubtitles, activeKaraokeTime);
  const activeKaraokeKey =
    activeKaraokeCue?.startTime != null && activeKaraokeCue.endTime != null
      ? getRetroKaraokeCueKey(activeKaraokeCue.startTime, activeKaraokeCue.endTime)
      : null;

  const transportBar = (
    <div className="w-full rounded-xl bg-black/35 px-3 pt-1 pb-2 ring-1 ring-white/10">
      <div className="group relative flex h-5 w-full items-center">
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-500/40"
          style={{
            left: `${Math.min(inPercent, outPercent)}%`,
            width: `${Math.max(0, outPercent - inPercent)}%`,
          }}
        />
        <input
          aria-label="Seek video"
          aria-valuetext={`${formatTime(overlay.currentTime)} of ${formatTime(overlay.videoLength)}`}
          disabled={!hasVideo}
          className="relative m-0 h-5 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-40 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
          style={{
            background: `linear-gradient(to right, #ef4444 ${Math.min(100, Math.max(0, (overlay.currentTime / (overlay.videoLength || 1)) * 100))}%, #ffffff30 0%) center / 100% 4px no-repeat`,
          }}
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          disabled={!hasVideo}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={togglePlayback}
          aria-label={overlay.isPlaying ? "Pause" : "Play"}
        >
          {overlay.isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>
        <span className="shrink-0 text-xs text-white/70 tabular-nums">
          {formatTime(overlay.currentTime)} / {formatTime(overlay.videoLength)}
        </span>
        {overlay.subtitleStyle === "retro-karaoke" && (
          <>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasVideo || !activeKaraokeKey}
              onClick={() => {
                const video = previewVideoRef.current;
                if (!video || !activeKaraokeKey) return;
                setOverlayState({
                  retroKaraokeSingingStarts: {
                    ...overlay.retroKaraokeSingingStarts,
                    [activeKaraokeKey]: video.currentTime + overlay.lyricOffset,
                  },
                });
                if (video.paused)
                  void video.play().catch(() => setOverlayState({ isPlaying: false }));
              }}
            >
              Start Singing
            </button>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                !activeKaraokeKey ||
                overlay.retroKaraokeSingingStarts[activeKaraokeKey] === undefined
              }
              onClick={() => {
                if (activeKaraokeCue?.startTime == null || !activeKaraokeKey) return;
                previewVideoRef.current?.pause();
                const starts = { ...overlay.retroKaraokeSingingStarts };
                delete starts[activeKaraokeKey];
                const time = Math.max(0, activeKaraokeCue.startTime - overlay.lyricOffset);
                if (previewVideoRef.current) previewVideoRef.current.currentTime = time;
                setOverlayState({
                  retroKaraokeSingingStarts: starts,
                  currentTime: time,
                  isPlaying: false,
                });
              }}
            >
              Restart Line
            </button>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
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
            Trim
          </button>
        </div>
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
                    <BackgroundImageLayer
                      url={overlay.backgroundImage}
                      outputWidth={outputWidth}
                      regionTop={0}
                      regionHeight={outputHeight}
                      centerVertically={overlay.isLandscapeMode}
                      offsetX={overlay.backgroundImageOffsetX}
                      offsetY={overlay.backgroundImageOffsetY}
                      scale={overlay.backgroundImageScale}
                      blur={overlay.backgroundImageBlur}
                      previewScale={previewHeight / outputHeight}
                    />
                  </div>
                )}
                {overlay.backgroundMode === "double-image" && (
                  <>
                    <div
                      className="pointer-events-none absolute top-0 left-0 h-1/2 w-full overflow-hidden"
                      style={{ zIndex: overlay.doubleImageLayer === "over" ? 1 : undefined }}
                    >
                      <BackgroundImageLayer
                        url={overlay.doubleBackgroundImage.image1}
                        outputWidth={outputWidth}
                        regionTop={0}
                        regionHeight={outputHeight / 2}
                        centerVertically
                        offsetX={overlay.doubleBackgroundImageOffsetX.image1}
                        offsetY={overlay.doubleBackgroundImageOffsetY.image1}
                        scale={overlay.doubleBackgroundImageScale.image1}
                        blur={overlay.doubleBackgroundImageBlur.image1}
                        previewScale={previewHeight / outputHeight}
                      />
                    </div>
                    <div
                      className="pointer-events-none absolute bottom-0 left-0 h-1/2 w-full overflow-hidden"
                      style={{ zIndex: overlay.doubleImageLayer === "over" ? 1 : undefined }}
                    >
                      <BackgroundImageLayer
                        url={overlay.doubleBackgroundImage.image2}
                        outputWidth={outputWidth}
                        regionTop={outputHeight / 2}
                        regionHeight={outputHeight / 2}
                        centerVertically
                        offsetX={overlay.doubleBackgroundImageOffsetX.image2}
                        offsetY={overlay.doubleBackgroundImageOffsetY.image2}
                        scale={overlay.doubleBackgroundImageScale.image2}
                        blur={overlay.doubleBackgroundImageBlur.image2}
                        previewScale={previewHeight / outputHeight}
                      />
                    </div>
                  </>
                )}
                <video
                  ref={previewVideoRef}
                  style={{
                    display: overlay.previewUrl ? "block" : "none",
                    top: `${displayedVideoTop}%`,
                    left: `${displayedVideoCenter}%`,
                    width: `${displayedVideoWidth}%`,
                    height: `${displayedVideoHeight}%`,
                    maxWidth: "none",
                    maxHeight: "none",
                    objectFit: "fill",
                    transform: "translateX(-50%)",
                    clipPath: isCropping
                      ? "none"
                      : `inset(${videoCropTopPercent}% ${(videoCrop.right / sourceVideoWidth) * 100}% ${videoCropBottomPercent}% ${(videoCrop.left / sourceVideoWidth) * 100}%)`,
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
                  opacity: isCropping ? 0 : 1,
                }}
                className="anchor-center pointer-events-none absolute top-0 left-0 h-full w-full self-center justify-self-center"
                ref={canvasRef}
              />
              {hasVideo && (
                <VideoCropControls
                  active={isCropping}
                  onActiveChange={(active) => {
                    if (active) previewVideoRef.current?.pause();
                    setIsCropping(active);
                  }}
                  crop={videoCrop}
                  sourceWidth={sourceVideoWidth}
                  sourceHeight={sourceVideoHeight}
                  left={displayedVideoCenter - displayedVideoWidth / 2}
                  top={displayedVideoTop}
                  width={displayedVideoWidth}
                  height={displayedVideoHeight}
                />
              )}
              <div
                className="group absolute inset-y-0 right-2 z-10 w-7 opacity-70 transition-opacity focus-within:opacity-100 hover:opacity-100"
                style={{ display: isCropping ? "none" : undefined }}
              >
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
              <div
                className={`flex w-full items-center justify-center rounded-xl bg-black text-sm text-white/50 ${
                  overlay.isLandscapeMode
                    ? "aspect-video"
                    : "aspect-[9/16] max-w-[22rem] self-center"
                }`}
                role="status"
              >
                Nothing is rendered
              </div>
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
          <OverlayInspector />
        </div>
      </div>
      <input
        ref={inputFileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          setIsCropping(false);
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
          setOverlayState({
            previewUrl: url,
            file: selectedFile,
            videoSourcePath: window.electron?.getVideoFilePath?.(selectedFile) || null,
          });

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
