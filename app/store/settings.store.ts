import { create } from "zustand";

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

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {
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
  },
  isLoaded: false,
  setSettings: (newSettings) => {
    const { settings } = get();
    const updatedSettings = { ...settings, ...newSettings };

    set({ settings: updatedSettings });
  },
  getSettings: () => {
    return get().settings;
  },
}));

async function loadAndInitializeSettings() {
  const storedSettings = localStorage.getItem("langpal-settings");
  if (storedSettings) {
    useSettingsStore.getState().setSettings(JSON.parse(storedSettings));
  }
}

void loadAndInitializeSettings();

export const getSettingsState = () => useSettingsStore.getState();

export const setSettingsState = (
  updates: Partial<SettingsStore["settings"]>
) => {
  const currentState = useSettingsStore.getState();
  useSettingsStore.setState({
    setSettings: currentState.setSettings,
    settings: { ...currentState.settings, ...updates },
  });
};
