import { create } from "zustand";

const defaultSrtExample = `1
00:00:00,000 --> 00:00:30,000
(yue)嗰個哥哥行銀行(en)That brother is walking to the bank`;

type OverlayStore = {
  customSrt: string;
  setCustomSrt: (customSrt: string) => void;
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
  setVideoDimensions: (videoDimensions: {
    width: number;
    height: number;
  }) => void;
  file: File | null;
  setFile: (file: File | null) => void;
};

export const useOverlayStore = create<OverlayStore>((set) => ({
  previewUrl: null,
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  loadedVideoId: null,
  setLoadedVideoId: (loadedVideoId) => set({ loadedVideoId }),
  customSrt: defaultSrtExample,
  setCustomSrt: (customSrt) => set({ customSrt }),
  verticalPosition: 200,
  setVerticalPosition: (verticalPosition) => set({ verticalPosition }),
  sizeMultiplier: 1,
  setSizeMultiplier: (sizeMultiplier) => set({ sizeMultiplier }),
  lyricOffset: 0,
  setLyricOffset: (lyricOffset) => set({ lyricOffset }),
  currentTime: 0,
  setCurrentTime: (currentTime) => set({ currentTime }),
  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  outputUrl: null,
  setOutputUrl: (outputUrl) => set({ outputUrl }),
  jsonData: {},
  setJsonData: (jsonData) => set({ jsonData }),
  videoDimensions: { width: 1920, height: 1080 },
  setVideoDimensions: (videoDimensions) => set({ videoDimensions }),
  file: null,
  setFile: (file) => set({ file }),
}));
