import { create } from "zustand";

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
  };
};

const overlayStore = create<OverlayStore>((set) => ({
  overlay: {
    previewUrl: null,
    loadedVideoId: null,
    verticalPosition: 200,
    sizeMultiplier: 1,
    lyricOffset: 0,
    currentTime: 0,
    isPlaying: false,
    isLoading: false,
    outputUrl: null,
    jsonData: {},
    videoDimensions: { width: 1920, height: 1080 },
    file: null,
    videoLength: 100,
    selectedTab: "editor",
    isLandscapeMode: true,
  } as OverlayStore["overlay"],
}));

export const getOverlayState = () => overlayStore.getState();
export const setOverlayState = (updates: Partial<OverlayStore["overlay"]>) => {
  const currentState = overlayStore.getState();
  overlayStore.setState({
    overlay: { ...currentState.overlay, ...updates },
  });
};
export const useOverlayStore = overlayStore;
