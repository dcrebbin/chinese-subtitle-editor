import { useState } from "react";

import { setOverlayState, useOverlayStore } from "../../store/overlay.store";
import { useSessionStore, type CaptionSegment } from "../../store/session.store";
import {
  getEnglishKaraokeCaptions,
  getRetroKaraokeCueKey,
  getRetroKaraokeLyricCaptions,
  getRetroKaraokeWeights,
} from "../../utilities/retro-karaoke-timing";
import { transliterateCaptions } from "../../utilities/srt";
import {
  retrieveChineseRomanizationMap,
  retrieveJapaneseRomanizationMap,
} from "../../utilities/transliteration/transliteration";

function timestampToSeconds(timestamp: string) {
  const [clock = "", milliseconds = "0"] = timestamp.split(",");
  const [hours = 0, minutes = 0, seconds = 0] = clock.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds + Number(milliseconds) / 1000;
}

function formatBoundaryTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${remainder.toFixed(2).padStart(5, "0")}` : remainder.toFixed(2);
}

export default function RetroKaraokeTimingEditor({ caption }: { caption: CaptionSegment }) {
  const { overlay } = useOverlayStore();
  const { session } = useSessionStore();
  const [selectedCell, setSelectedCell] = useState(0);
  const startTime = timestampToSeconds(caption.startTime);
  const endTime = timestampToSeconds(caption.endTime);
  const cueKey = getRetroKaraokeCueKey(startTime, endTime);
  const sourceLanguage = caption.text.jp
    ? "jp"
    : caption.text.yue
      ? "yue"
      : caption.text.ko
        ? "ko"
        : "zh";
  const sourceText =
    caption.text.yue ||
    caption.text.zh ||
    caption.text.jp ||
    caption.text.ko ||
    caption.text.en ||
    "";
  const isEnglishOnly = !(
    caption.text.yue ||
    caption.text.zh ||
    caption.text.jp ||
    caption.text.ko
  );
  const captions = getRetroKaraokeLyricCaptions(
    isEnglishOnly
      ? getEnglishKaraokeCaptions(sourceText)
      : sourceLanguage === "jp"
        ? retrieveJapaneseRomanizationMap(sourceText, session.japaneseTransliterations[sourceText])
        : retrieveChineseRomanizationMap(
            transliterateCaptions(sourceText, sourceLanguage, {}),
            sourceText,
          ),
  );

  if (captions.length === 0 || endTime <= startTime) return null;

  const multipliers = overlay.retroKaraokeTimingOverrides[cueKey] ?? {};
  const weights = getRetroKaraokeWeights(
    captions,
    overlay.retroKaraokeLengthInfluence,
    multipliers,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const singingStart = Math.min(
    endTime,
    Math.max(startTime, overlay.retroKaraokeSingingStarts[cueKey] ?? startTime),
  );
  const duration = endTime - singingStart;
  let elapsedWeight = 0;
  const boundaries = [singingStart];
  for (const weight of weights) {
    elapsedWeight += weight;
    boundaries.push(singingStart + (elapsedWeight / totalWeight) * duration);
  }
  const selectedMultiplier = multipliers[selectedCell] ?? 1;

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-blue-300/30 bg-blue-950/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Karaoke syllable timing</p>
        <button
          type="button"
          className="cursor-pointer text-xs text-blue-200 underline hover:text-white"
          onClick={() => {
            const nextOverrides = { ...overlay.retroKaraokeTimingOverrides };
            delete nextOverrides[cueKey];
            setOverlayState({ retroKaraokeTimingOverrides: nextOverrides });
          }}
        >
          Reset
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        Singing delay (seconds)
        <input
          type="number"
          min={0}
          max={Math.max(0, endTime - startTime - 0.01)}
          step={0.1}
          value={Number((singingStart - startTime).toFixed(3))}
          className="w-24 rounded bg-black/30 px-2 py-1"
          onChange={(event) => {
            const delay = event.target.valueAsNumber;
            if (!Number.isFinite(delay)) return;
            setOverlayState({
              retroKaraokeSingingStarts: {
                ...overlay.retroKaraokeSingingStarts,
                [cueKey]:
                  startTime + Math.min(Math.max(0, endTime - startTime - 0.01), Math.max(0, delay)),
              },
            });
          }}
        />
      </label>
      <div className="w-full overflow-x-auto pb-1">
        <div className="min-w-[32rem]">
          <div className="flex h-14 w-full overflow-hidden rounded-lg border border-white/40">
            {captions.map((item, index) => (
              <button
                type="button"
                key={`${item.chinese}-${index}`}
                style={{ width: `${(weights[index]! / totalWeight) * 100}%` }}
                className={`min-w-0 cursor-pointer border-r border-white/40 px-1 text-center last:border-r-0 ${
                  selectedCell === index ? "bg-blue-600" : "bg-black/30 hover:bg-white/10"
                }`}
                onClick={() => setSelectedCell(index)}
              >
                <span className="block truncate text-lg font-bold">{item.chinese}</span>
                <span className="block truncate text-[10px] text-white/70">
                  {item.jyutping === "EN" ? "" : item.jyutping}
                </span>
              </button>
            ))}
          </div>
          <div className="relative h-7 text-[10px] text-white/70 tabular-nums">
            {boundaries.map((boundary, index) => {
              const left = ((boundary - startTime) / (endTime - startTime)) * 100;
              const transform =
                index === 0
                  ? "none"
                  : index === boundaries.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)";
              return (
                <span
                  key={`${boundary}-${index}`}
                  className="absolute top-1 whitespace-nowrap"
                  style={{ left: `${left}%`, transform }}
                >
                  {formatBoundaryTime(boundary)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Hold “{captions[selectedCell]?.chinese}” — {selectedMultiplier.toFixed(1)}×
        <input
          type="range"
          min={0.5}
          max={15}
          step={0.1}
          value={selectedMultiplier}
          onChange={(event) => {
            setOverlayState({
              retroKaraokeTimingOverrides: {
                ...overlay.retroKaraokeTimingOverrides,
                [cueKey]: {
                  ...multipliers,
                  [selectedCell]: Number.parseFloat(event.target.value),
                },
              },
            });
          }}
        />
      </label>
    </div>
  );
}
