import { create } from "zustand";

const OVERLAY_SETTINGS_STORAGE_KEY = "langpal-overlay-settings";

type OverlayStore = {
  overlay: {
    previewUrl: string | null;
    setPreviewUrl: (previewUrl: string | null) => void;
    loadedVideoId: string | null;
    setLoadedVideoId: (loadedVideoId: string | null) => void;
    verticalPosition: number;
    setVerticalPosition: (verticalPosition: number) => void;
    sizeMultiplier: number;
    setSizeMultiplier: (sizeMultiplier: number) => void;
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
    file: File | null;
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
    doubleBackgroundImage: { image1: string | null; image2: string | null };
    setDoubleBackgroundImage: (doubleBackgroundImage: {
      image1: string | null;
      image2: string | null;
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
  | "sizeMultiplier"
  | "lyricOffset"
  | "selectedTab"
  | "isLandscapeMode"
  | "backgroundMode"
  | "backgroundImage"
  | "doubleBackgroundImage"
  | "colour"
  | "videoPosition"
  | "downloadVideoId"
  | "loadedVideoId"
>;

const defaultPersistableOverlaySettings: PersistableOverlaySettings = {
  verticalPosition: 200,
  sizeMultiplier: 1,
  lyricOffset: 0,
  selectedTab: "editor",
  isLandscapeMode: true,
  backgroundMode: "colour",
  backgroundImage: null,
  doubleBackgroundImage: { image1: null, image2: null },
  colour: null,
  videoPosition: "center",
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
    sizeMultiplier: overlay.sizeMultiplier,
    lyricOffset: overlay.lyricOffset,
    selectedTab: overlay.selectedTab,
    isLandscapeMode: overlay.isLandscapeMode,
    backgroundMode: overlay.backgroundMode,
    backgroundImage: overlay.backgroundImage,
    doubleBackgroundImage: overlay.doubleBackgroundImage,
    colour: overlay.colour,
    videoPosition: overlay.videoPosition,
    downloadVideoId: overlay.downloadVideoId,
    loadedVideoId: overlay.loadedVideoId,
  });

  try {
    localStorage.setItem(
      OVERLAY_SETTINGS_STORAGE_KEY,
      JSON.stringify(settingsToSave),
    );
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
