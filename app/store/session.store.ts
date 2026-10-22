import { create } from "zustand";

import { defaultSrtExample } from "../utilities/constants";
import { parseSrt } from "../utilities/srt";
import {
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../utilities/transliteration/transliteration";
import {
  loadSrtFromLocalStorage,
  saveJapaneseTransliterationsToLocalStorage,
  saveLyricsToLocalStorage,
  saveSrtToLocalStorage,
} from "../utilities/video-storage";

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

export interface JapaneseTransliterationGroup {
  surface: string;
  romaji: string;
  hiragana: string;
  katakana: string;
  gloss: string;
  lemma: string;
  partOfSpeech: string;
  form: string;
}

export interface SavedJapaneseTransliteration {
  sourceText: string;
  groups: JapaneseTransliterationGroup[];
  convertedAt: string;
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
    video: HTMLVideoElement | null;
    localCaptions: CaptionSegment[];
    originalCaptions: CaptionSegment[];
    selectedTab: "captions" | "search" | "testing" | "generate";
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
    lyrics: string;
    generationLanguage: string;
    translationLanguage: string;
    saveError: string;
    subtitleOffset: number;
    japaneseTransliterations: Record<string, SavedJapaneseTransliteration>;
  };
  setSession: (session: SessionStore["session"]) => void;
}

// Create the store
const sessionStore = create<SessionStore>(() => ({
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
    parsedSubtitles: parseSrt(defaultSrtExample) as ParsedSubtitle[],
    isLoading: false,
    srtContent: defaultSrtExample,
    vpnWarning: false,
    platform: "",
    isInitialized: false,
    video: null,
    videoId: "",
    hasCloudCaptions: false,
    localCaptions: convertSrtToCaptions(defaultSrtExample),
    originalCaptions: convertSrtToCaptions(defaultSrtExample),
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
    lyrics: "",
    generationLanguage: "yue",
    translationLanguage: "none",
    saveError: "",
    subtitleOffset: 0,
    japaneseTransliterations: {},
  },
  setSession: (session) => commitSession(session),
}));

export const useSessionStore = sessionStore;

export const getSessionState = () => sessionStore.getState();
export const setSessionState = (updates: Partial<SessionStore["session"]>) =>
  commitSession(updates);

function commitSession(updates: Partial<SessionStore["session"]>) {
  const previous = sessionStore.getState().session;
  const session = {
    ...previous,
    ...updates,
    localCaptions: updates.localCaptions ?? previous.localCaptions,
  };
  const sourceChanged = session.videoId !== previous.videoId;
  if (
    sourceChanged &&
    (updates.srtContent === undefined || updates.srtContent === previous.srtContent)
  ) {
    const saved = loadSrtFromLocalStorage(session.videoId);
    if (saved !== null) {
      session.srtContent = saved;
      session.originalSrtContent = saved;
    }
    session.subtitleOffset = 0;
  }
  if (
    updates.originalSrtContent !== undefined &&
    updates.originalSrtContent !== previous.originalSrtContent &&
    updates.subtitleOffset === undefined
  )
    session.subtitleOffset = 0;
  const srtChanged = session.srtContent !== previous.srtContent;
  const captionsChanged =
    updates.localCaptions !== undefined && updates.localCaptions !== previous.localCaptions;
  if (srtChanged && !captionsChanged) {
    session.localCaptions = convertSrtToCaptions(session.srtContent);
    session.originalCaptions = session.localCaptions;
  } else if (captionsChanged) {
    session.srtContent = convertCaptionsToSrt(session.localCaptions);
  }
  if (srtChanged || captionsChanged) {
    session.localSrtContent = session.srtContent;
    session.parsedSubtitles = parseSrt(session.srtContent) as ParsedSubtitle[];
    session.saveError =
      typeof window !== "undefined" && !saveSrtToLocalStorage(session.videoId, session.srtContent)
        ? "Changes could not be saved on this device. Download your subtitles to keep a copy."
        : "";
  }
  if (session.lyrics !== previous.lyrics) saveLyricsToLocalStorage(session.videoId, session.lyrics);
  if (session.japaneseTransliterations !== previous.japaneseTransliterations) {
    saveJapaneseTransliterationsToLocalStorage(session.videoId, session.japaneseTransliterations);
  }
  if (
    typeof window !== "undefined" &&
    (session.lyrics !== previous.lyrics ||
      session.generationLanguage !== previous.generationLanguage ||
      session.translationLanguage !== previous.translationLanguage)
  ) {
    try {
      localStorage.setItem(
        "langpal-generation-draft",
        JSON.stringify({
          lyrics: session.lyrics,
          generationLanguage: session.generationLanguage,
          translationLanguage: session.translationLanguage,
        }),
      );
    } catch {
      session.saveError = "Changes could not be saved on this device.";
    }
  }
  sessionStore.setState({ session });
}

export function restoreEditorDraft() {
  if (typeof window === "undefined") return;
  const current = sessionStore.getState().session;
  const saved = loadSrtFromLocalStorage(current.videoId);
  let draft: Partial<SessionStore["session"]> = {};
  try {
    const data = JSON.parse(localStorage.getItem("langpal-generation-draft") || "{}");
    if (typeof data.lyrics === "string") draft.lyrics = data.lyrics;
    if (typeof data.generationLanguage === "string")
      draft.generationLanguage = data.generationLanguage;
    if (typeof data.translationLanguage === "string")
      draft.translationLanguage = data.translationLanguage;
  } catch {
    /* Ignore invalid saved drafts. */
  }
  if (saved !== null) draft = { ...draft, srtContent: saved, originalSrtContent: saved };
  commitSession(draft);
}
