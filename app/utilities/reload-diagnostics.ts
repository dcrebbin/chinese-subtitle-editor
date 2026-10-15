// Dev-only: records why the page reloaded. Inspect with `__reloadLog()` in the console.
const STORAGE_KEY = "__reload_diagnostics";
const MAX_ENTRIES = 50;

type Entry = { time: string; event: string; detail?: unknown };

function readLog(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function record(event: string, detail?: unknown) {
  const entries = [...readLog(), { time: new Date().toISOString(), event, detail }].slice(
    -MAX_ENTRIES,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  console.info(`[reload-diagnostics] ${event}`, detail ?? "");
}

if (import.meta.env.DEV && typeof window !== "undefined" && import.meta.hot) {
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  record("page-load", { type: navigation?.type, url: location.href });

  import.meta.hot.on("vite:beforeFullReload", (payload) => record("vite:beforeFullReload", payload));
  import.meta.hot.on("vite:beforeUpdate", (payload) =>
    record(
      "vite:beforeUpdate",
      payload.updates.map((update) => update.path),
    ),
  );
  import.meta.hot.on("vite:invalidate", (payload) => record("vite:invalidate", payload));
  import.meta.hot.on("vite:error", (payload) => record("vite:error", payload.err?.message));
  import.meta.hot.on("vite:ws:disconnect", () => record("vite:ws:disconnect"));
  import.meta.hot.on("vite:ws:connect", () => record("vite:ws:connect"));

  window.addEventListener("pagehide", () =>
    record("pagehide", { visibility: document.visibilityState }),
  );
  window.addEventListener("pageshow", (event) => record("pageshow", { persisted: event.persisted }));

  Object.assign(window, { __reloadLog: () => console.table(readLog()) });
}
