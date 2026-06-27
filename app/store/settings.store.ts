import { create } from "zustand";

const SETTINGS_STORAGE_KEY = "langpal-settings";

export interface SettingsStore {
  settings: {
    segmentStyling: number;
    subtitleSize: number;
    subtitlePadding: number;
    opacity: number;
    knownCharacters: {
      zh_CN: Record<string, boolean>;
      zh_HK: Record<string, boolean>;
    };
    uploadSrt: boolean;
    asrModel: string;
    language: string;
    hideKnownCharacters: boolean;
    alwaysTryToRetrieveSubtitles: boolean;
    isEnglishEnabled: boolean;
    selectedLanguageCode: string;
    yAxis: number;
    isLangpalSubtitlesOn: boolean;
    isCustomSubtitlesEnabled: boolean;
    visualFonts: string;
    timeSinceSync: number;
    subtitleScreenPercentage: number;
    accessToken: string;
    refreshToken: string;
    forceSimplifiedChinese: boolean;
    useToneNumbers: boolean;
  };
  isLoaded: boolean;
  setSettings: (settings: Partial<SettingsStore["settings"]>) => void;
  getSettings: () => SettingsStore["settings"];
}

export const defaultSettings: SettingsStore["settings"] = {
  segmentStyling: 0,
  subtitleSize: 16,
  subtitlePadding: 10,
  opacity: 100,
  knownCharacters: {
    zh_CN: {},
    zh_HK: {},
  },
  language: "yue",
  subtitleScreenPercentage: 0.9,
  uploadSrt: false,
  asrModel: "whisper-large-v2",
  selectedLanguageCode: "yue",
  hideKnownCharacters: false,
  alwaysTryToRetrieveSubtitles: false,
  isEnglishEnabled: false,
  yAxis: 0,
  isLangpalSubtitlesOn: true,
  isCustomSubtitlesEnabled: false,
  visualFonts: "Arial",
  timeSinceSync: 0,
  accessToken: "",
  refreshToken: "",
  forceSimplifiedChinese: false,
  useToneNumbers: false,
};

function mergeSettings(
  stored: Partial<SettingsStore["settings"]>,
): SettingsStore["settings"] {
  return {
    ...defaultSettings,
    ...stored,
    knownCharacters: {
      zh_CN: {
        ...defaultSettings.knownCharacters.zh_CN,
        ...stored.knownCharacters?.zh_CN,
      },
      zh_HK: {
        ...defaultSettings.knownCharacters.zh_HK,
        ...stored.knownCharacters?.zh_HK,
      },
    },
  };
}

function loadSettingsFromStorage(): SettingsStore["settings"] {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  try {
    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!storedSettings) {
      return defaultSettings;
    }

    return mergeSettings(JSON.parse(storedSettings));
  } catch (error) {
    console.error("Failed to load settings from localStorage:", error);
    return defaultSettings;
  }
}

function persistSettings(settings: SettingsStore["settings"]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save settings to localStorage:", error);
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: loadSettingsFromStorage(),
  isLoaded: typeof window !== "undefined",
  setSettings: (newSettings) => {
    const updatedSettings = mergeSettings({ ...get().settings, ...newSettings });
    set({ settings: updatedSettings });
    persistSettings(updatedSettings);
  },
  getSettings: () => {
    return get().settings;
  },
}));

export const getSettingsState = () => useSettingsStore.getState();

export const setSettingsState = (
  updates: Partial<SettingsStore["settings"]>,
) => {
  useSettingsStore.getState().setSettings(updates);
};
