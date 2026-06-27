const SRT_STORAGE_KEY_PREFIX = "langpal-srt-content-";
const LYRICS_STORAGE_KEY_PREFIX = "langpal-lyrics-";

export function getSrtStorageKey(videoId: string) {
  return `${SRT_STORAGE_KEY_PREFIX}${videoId}`;
}

export function getLyricsStorageKey(videoId: string) {
  return `${LYRICS_STORAGE_KEY_PREFIX}${videoId}`;
}

export function saveLyricsToLocalStorage(videoId: string, lyrics: string) {
  if (typeof window === "undefined" || !videoId) {
    return;
  }

  try {
    localStorage.setItem(getLyricsStorageKey(videoId), lyrics);
  } catch (error) {
    console.error("Failed to save lyrics to localStorage:", error);
  }
}

export function loadLyricsFromLocalStorage(videoId: string): string | null {
  if (typeof window === "undefined" || !videoId) {
    return null;
  }

  try {
    return localStorage.getItem(getLyricsStorageKey(videoId));
  } catch (error) {
    console.error("Failed to load lyrics from localStorage:", error);
    return null;
  }
}

export function loadSrtFromLocalStorage(videoId: string): string | null {
  if (typeof window === "undefined" || !videoId) {
    return null;
  }

  try {
    return localStorage.getItem(getSrtStorageKey(videoId));
  } catch (error) {
    console.error("Failed to load subtitles from localStorage:", error);
    return null;
  }
}
