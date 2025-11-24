import { create } from "zustand";

import { defaultSrtExample } from "../utilities/constants";

export interface CaptionSegment {
  startTime: string;
  endTime: string;
  text: {
    [key: string]: string | null;
  };
}

export interface CaptionLanguage {
  name: string;
  code: string;
}

export interface ParsedSubtitle {
  startTime: number;
  endTime: number;
  text: string;
}

export interface SessionStore {
  session: {
    isLangpalSubtitlesOn: boolean;
    isLoading: boolean;
    langpalSettingsModalOpen: boolean;
    uploadModalOpen: boolean;
    subtitlesEditorOpen: boolean;
    hasCustomCaptions: boolean;
    srtContent: string;
    platform: string;
    isInitialized: boolean;
    vpnWarning: boolean;
    parsedSubtitles: ParsedSubtitle[];
    setParsedSubtitles: (parsedSubtitles: ParsedSubtitle[]) => void;
    video: HTMLVideoElement | null;
    localCaptions: CaptionSegment[];
    originalCaptions: CaptionSegment[];
    selectedTab: "captions" | "search" | "testing";
    localSrtContent: string;
    hasCloudCaptions: boolean;
    originalSrtContent: string;
    videoId: string;
    isSafari: boolean;
    isDeleteAccountModalOpen: boolean;
    isCreateAccountModalOpen: boolean;
    transliterationModalOpen: boolean;
    transliterationText: {
      transliteratedText: string;
      chinese: string;
      languageCode: string;
    }[];
    transliterationModalPosition: {
      top: number;
      left: number;
    };
    mainObserver: MutationObserver | null;
    currentTranscript: string;
    lastElementSelected: HTMLElement | null;
    karaokeModalOpen: boolean;
    karaokeText: string;
    karaokeGuess: string;
  };
  setSession: (session: SessionStore["session"]) => void;
}

// Create the store
const sessionStore = create<SessionStore>((set) => ({
  session: {
    transliterationModalOpen: false,
    transliterationModalPosition: {
      top: 0,
      left: 0,
    },
    isLangpalSubtitlesOn: true,
    langpalSettingsModalOpen: false,
    uploadModalOpen: false,
    subtitlesEditorOpen: false,
    selectedTab: "captions",
    hasCustomCaptions: false,
    transliterationText: [],
    parsedSubtitles: [],
    setParsedSubtitles: (parsedSubtitles: ParsedSubtitle[]) =>
      set({ session: { ...get().session, parsedSubtitles } }),
    isLoading: false,
    srtContent: defaultSrtExample,
    vpnWarning: false,
    platform: "",
    isInitialized: false,
    video: null,
    videoId: "",
    hasCloudCaptions: false,
    localCaptions: [] as CaptionSegment[],
    originalCaptions: [] as CaptionSegment[],
    localSrtContent: defaultSrtExample,
    originalSrtContent: defaultSrtExample,
    isSafari: false,
    isDeleteAccountModalOpen: false,
    isCreateAccountModalOpen: false,
    currentTranscript: "",
    lastElementSelected: null,
    mainObserver: null,
    karaokeModalOpen: false,
    karaokeText: "",
    karaokeGuess: "",
  },
  setSession: (session) => set({ session }),
}));

export const useSessionStore = sessionStore;

export const getSessionState = () => sessionStore.getState();
export const setSessionState = (updates: Partial<SessionStore["session"]>) => {
  const currentState = sessionStore.getState();
  sessionStore.setState({
    setSession: currentState.setSession,
    session: { ...currentState.session, ...updates },
  });
};
