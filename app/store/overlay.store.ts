import { create } from "zustand";

const OVERLAY_SETTINGS_STORAGE_KEY = "langpal-overlay-settings";
export type SubtitleStyle = "learning-cards" | "retro-karaoke" | "brain-rot";
export type RetroKaraokeTimingOverrides = Record<string, Record<number, number>>;

type OverlayStore = {
  overlay: {
    previewUrl: string | null;
    setPreviewUrl: (previewUrl: string | null) => void;
    loadedVideoId: string | null;
    setLoadedVideoId: (loadedVideoId: string | null) => void;
    verticalPosition: number;
    horizontalPosition: number;
    setVerticalPosition: (verticalPosition: number) => void;
    sizeMultiplier: number;
    flipSubtitleRows: boolean;
    separateTextSizes: boolean;
    sourceTextSize: number;
    romanizationTextSize: number;
    translationTextSize: number;
    setSizeMultiplier: (sizeMultiplier: number) => void;
    transliterationEnabled: boolean;
    setTransliterationEnabled: (transliterationEnabled: boolean) => void;
    subtitleStyle: SubtitleStyle;
    setSubtitleStyle: (subtitleStyle: SubtitleStyle) => void;
    retroKaraokeLengthInfluence: number;
    retroKaraokeTimingOverrides: RetroKaraokeTimingOverrides;
    retroKaraokeSingingStarts: Record<string, number>;
    lyricOffset: number;
    setLyricOffset: (lyricOffset: number) => void;
    startTime: number;
    setStartTime: (startTime: number) => void;
    endTime: number;
    setEndTime: (endTime: number) => void;
    currentTime: number;
    setCurrentTime: (currentTime: number) => void;
    isPlaying: boolean;
    setIsPlaying: (isPlaying: boolean) => void;
    isLoading: boolean;
    setIsLoading: (isLoading: boolean) => void;
    outputUrl: string | null;
    setOutputUrl: (outputUrl: string | null) => void;
    jsonData: Record<string, unknown>;
    setJsonData: (jsonData: Record<string, unknown>) => void;
    videoDimensions: { width: number; height: number };
    setVideoDimensions: (videoDimensions: { width: number; height: number }) => void;
    videoScale: number;
    videoOffsetX: number;
    videoOffsetY: number;
    videoCropLeft: number;
    videoCropRight: number;
    videoCropTop: number;
    setVideoCropTop: (videoCropTop: number) => void;
    videoCropBottom: number;
    setVideoCropBottom: (videoCropBottom: number) => void;
    file: File | null;
    videoSourcePath: string | null;
    videoLength: number;
    setVideoLength: (videoLength: number) => void;
    setFile: (file: File | null) => void;
    selectedTab: "editor" | "render";
    setSelectedTab: (selectedTab: "editor" | "render") => void;
    isLandscapeMode: boolean;
    setIsLandscapeMode: (isLandscapeMode: boolean) => void;
    backgroundMode: "colour" | "full-image" | "double-image";
    setBackgroundMode: (backgroundMode: "colour" | "full-image" | "double-image") => void;
    backgroundImage: string | null;
    setBackgroundImage: (backgroundImage: string | null) => void;
    backgroundImageOffsetY: number;
    setBackgroundImageOffsetY: (backgroundImageOffsetY: number) => void;
    backgroundImageOffsetX: number;
    backgroundImageScale: number;
    doubleImageLayer: "under" | "over";
    doubleBackgroundImage: { image1: string | null; image2: string | null };
    setDoubleBackgroundImage: (doubleBackgroundImage: {
      image1: string | null;
      image2: string | null;
    }) => void;
    backgroundImageBlur: number;
    doubleBackgroundImageBlur: { image1: number; image2: number };
    doubleBackgroundImageOffsetX: { image1: number; image2: number };
    doubleBackgroundImageScale: { image1: number; image2: number };
    doubleBackgroundImageOffsetY: { image1: number; image2: number };
    setDoubleBackgroundImageOffsetY: (doubleBackgroundImageOffsetY: {
      image1: number;
      image2: number;
    }) => void;
    colour: string | null;
    setColour: (colour: string | null) => void;
    videoPosition: "top" | "center" | "bottom";
    setVideoPosition: (videoPosition: "top" | "center" | "bottom") => void;
    downloadVideoId: string | null;
    setDownloadVideoId: (downloadVideoId: string | null) => void;
    videoIsDownloading: boolean;
    setVideoIsDownloading: (videoIsDownloading: boolean) => void;
  };
};

type PersistableOverlaySettings = Pick<
  OverlayStore["overlay"],
  | "verticalPosition"
  | "horizontalPosition"
  | "sizeMultiplier"
  | "flipSubtitleRows"
  | "separateTextSizes"
  | "sourceTextSize"
  | "romanizationTextSize"
  | "translationTextSize"
  | "transliterationEnabled"
  | "subtitleStyle"
  | "retroKaraokeLengthInfluence"
  | "retroKaraokeTimingOverrides"
  | "retroKaraokeSingingStarts"
  | "lyricOffset"
  | "selectedTab"
  | "isLandscapeMode"
  | "backgroundMode"
  | "backgroundImage"
  | "backgroundImageOffsetY"
  | "backgroundImageOffsetX"
  | "backgroundImageScale"
  | "doubleImageLayer"
  | "doubleBackgroundImage"
  | "doubleBackgroundImageOffsetY"
  | "backgroundImageBlur"
  | "doubleBackgroundImageBlur"
  | "doubleBackgroundImageOffsetX"
  | "doubleBackgroundImageScale"
  | "colour"
  | "videoPosition"
  | "videoScale"
  | "videoOffsetX"
  | "videoOffsetY"
  | "videoCropLeft"
  | "videoCropRight"
  | "videoCropTop"
  | "videoCropBottom"
  | "downloadVideoId"
  | "loadedVideoId"
>;

export const defaultPersistableOverlaySettings: PersistableOverlaySettings = {
  verticalPosition: 200,
  horizontalPosition: 0,
  sizeMultiplier: 1,
  flipSubtitleRows: false,
  separateTextSizes: false,
  sourceTextSize: 1,
  romanizationTextSize: 1,
  translationTextSize: 1,
  transliterationEnabled: true,
  subtitleStyle: "learning-cards",
  retroKaraokeLengthInfluence: 0.5,
  retroKaraokeTimingOverrides: {},
  retroKaraokeSingingStarts: {},
  lyricOffset: 0,
  selectedTab: "editor",
  isLandscapeMode: true,
  backgroundMode: "colour",
  backgroundImage: null,
  backgroundImageOffsetY: 0,
  backgroundImageOffsetX: 0,
  backgroundImageScale: 1,
  doubleImageLayer: "under",
  doubleBackgroundImage: { image1: null, image2: null },
  doubleBackgroundImageOffsetY: { image1: 0, image2: 0 },
  backgroundImageBlur: 0,
  doubleBackgroundImageBlur: { image1: 0, image2: 0 },
  doubleBackgroundImageOffsetX: { image1: 0, image2: 0 },
  doubleBackgroundImageScale: { image1: 1, image2: 1 },
  colour: null,
  videoPosition: "center",
  videoScale: 1,
  videoOffsetX: 0,
  videoOffsetY: 0,
  videoCropLeft: 0,
  videoCropRight: 0,
  videoCropTop: 0,
  videoCropBottom: 0,
  downloadVideoId: null,
  loadedVideoId: null,
};

function isPersistableImageUrl(url: string | null) {
  return url !== null && !url.startsWith("blob:");
}

function sanitizePersistableOverlaySettings(
  settings: Partial<PersistableOverlaySettings>,
): PersistableOverlaySettings {
  const merged = {
    ...defaultPersistableOverlaySettings,
    ...settings,
    doubleBackgroundImage: {
      ...defaultPersistableOverlaySettings.doubleBackgroundImage,
      ...settings.doubleBackgroundImage,
    },
    doubleBackgroundImageOffsetY: {
      ...defaultPersistableOverlaySettings.doubleBackgroundImageOffsetY,
      ...settings.doubleBackgroundImageOffsetY,
    },
    doubleBackgroundImageBlur: {
      ...defaultPersistableOverlaySettings.doubleBackgroundImageBlur,
      ...settings.doubleBackgroundImageBlur,
    },
    doubleBackgroundImageOffsetX: {
      ...defaultPersistableOverlaySettings.doubleBackgroundImageOffsetX,
      ...settings.doubleBackgroundImageOffsetX,
    },
    doubleBackgroundImageScale: {
      ...defaultPersistableOverlaySettings.doubleBackgroundImageScale,
      ...settings.doubleBackgroundImageScale,
    },
  };

  if (!isPersistableImageUrl(merged.backgroundImage)) {
    merged.backgroundImage = null;
  }

  merged.doubleBackgroundImage = {
    image1: isPersistableImageUrl(merged.doubleBackgroundImage.image1)
      ? merged.doubleBackgroundImage.image1
      : null,
    image2: isPersistableImageUrl(merged.doubleBackgroundImage.image2)
      ? merged.doubleBackgroundImage.image2
      : null,
  };

  return merged;
}

function loadOverlaySettingsFromStorage(): PersistableOverlaySettings {
  if (typeof window === "undefined") {
    return defaultPersistableOverlaySettings;
  }

  try {
    const storedSettings = localStorage.getItem(OVERLAY_SETTINGS_STORAGE_KEY);
    if (!storedSettings) {
      return defaultPersistableOverlaySettings;
    }

    return sanitizePersistableOverlaySettings(JSON.parse(storedSettings));
  } catch (error) {
    console.error("Failed to load overlay settings from localStorage:", error);
    return defaultPersistableOverlaySettings;
  }
}

function persistOverlaySettings(overlay: OverlayStore["overlay"]) {
  if (typeof window === "undefined") {
    return;
  }

  const settingsToSave = sanitizePersistableOverlaySettings({
    verticalPosition: overlay.verticalPosition,
    horizontalPosition: overlay.horizontalPosition,
    sizeMultiplier: overlay.sizeMultiplier,
    flipSubtitleRows: overlay.flipSubtitleRows,
    separateTextSizes: overlay.separateTextSizes,
    sourceTextSize: overlay.sourceTextSize,
    romanizationTextSize: overlay.romanizationTextSize,
    translationTextSize: overlay.translationTextSize,
    transliterationEnabled: overlay.transliterationEnabled,
    subtitleStyle: overlay.subtitleStyle,
    retroKaraokeLengthInfluence: overlay.retroKaraokeLengthInfluence,
    retroKaraokeTimingOverrides: overlay.retroKaraokeTimingOverrides,
    retroKaraokeSingingStarts: overlay.retroKaraokeSingingStarts,
    lyricOffset: overlay.lyricOffset,
    selectedTab: overlay.selectedTab,
    isLandscapeMode: overlay.isLandscapeMode,
    backgroundMode: overlay.backgroundMode,
    backgroundImage: overlay.backgroundImage,
    backgroundImageOffsetY: overlay.backgroundImageOffsetY,
    backgroundImageOffsetX: overlay.backgroundImageOffsetX,
    backgroundImageScale: overlay.backgroundImageScale,
    doubleImageLayer: overlay.doubleImageLayer,
    doubleBackgroundImage: overlay.doubleBackgroundImage,
    doubleBackgroundImageOffsetY: overlay.doubleBackgroundImageOffsetY,
    backgroundImageBlur: overlay.backgroundImageBlur,
    doubleBackgroundImageBlur: overlay.doubleBackgroundImageBlur,
    doubleBackgroundImageOffsetX: overlay.doubleBackgroundImageOffsetX,
    doubleBackgroundImageScale: overlay.doubleBackgroundImageScale,
    colour: overlay.colour,
    videoPosition: overlay.videoPosition,
    videoScale: overlay.videoScale,
    videoOffsetX: overlay.videoOffsetX,
    videoOffsetY: overlay.videoOffsetY,
    videoCropLeft: overlay.videoCropLeft,
    videoCropRight: overlay.videoCropRight,
    videoCropTop: overlay.videoCropTop,
    videoCropBottom: overlay.videoCropBottom,
    downloadVideoId: overlay.downloadVideoId,
    loadedVideoId: overlay.loadedVideoId,
  });

  try {
    localStorage.setItem(OVERLAY_SETTINGS_STORAGE_KEY, JSON.stringify(settingsToSave));
  } catch (error) {
    console.error("Failed to save overlay settings to localStorage:", error);
  }
}

const persistedOverlaySettings = loadOverlaySettingsFromStorage();

const overlayStore = create<OverlayStore>(() => ({
  overlay: {
    previewUrl: null,
    videoIsDownloading: false,
    startTime: 0,
    endTime: 0,
    currentTime: 0,
    isPlaying: false,
    isLoading: false,
    outputUrl: null,
    jsonData: {},
    videoDimensions: { width: 1920, height: 1080 },
    file: null,
    videoSourcePath: null,
    videoLength: 100,
    ...persistedOverlaySettings,
  } as OverlayStore["overlay"],
}));

export const getOverlayState = () => overlayStore.getState();
export const setOverlayState = (updates: Partial<OverlayStore["overlay"]>) => {
  const currentState = overlayStore.getState();
  const updatedOverlay = { ...currentState.overlay, ...updates };
  overlayStore.setState({
    overlay: updatedOverlay,
  });
  persistOverlaySettings(updatedOverlay);
};
export const useOverlayStore = overlayStore;
