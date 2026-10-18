import { useState } from "react";

import { setOverlayState, useOverlayStore, type SubtitleStyle } from "@/app/store/overlay.store";
import {
  ImagePicker,
  InspectorRow,
  InspectorSection,
  NumberField,
  Segmented,
  SliderRow,
  Toggle,
} from "./inspector-controls";

type InspectorTab = "captions" | "video" | "background";

const inspectorTabs = [
  ["captions", "Captions"],
  ["video", "Video"],
  ["background", "Background"],
] as const;

const subtitleStyleOptions = [
  ["learning-cards", "Cards"],
  ["retro-karaoke", "Karaoke"],
  ["brain-rot", "Brain rot"],
] as const;

const subtitleStyleDescriptions: Record<SubtitleStyle, string> = {
  "learning-cards": "Each character in a card with its romanization.",
  "retro-karaoke": "80s/90s karaoke wipe. Fine-tune syllables on each row in the subtitle editor.",
  "brain-rot": "Bold white captions with thick outlines. No highlights or romanization.",
};

type VideoCrop = { top: number; bottom: number; left: number; right: number };

export default function OverlayInspector({
  hasVideo,
  videoCrop,
  sourceVideoWidth,
  sourceVideoHeight,
}: {
  hasVideo: boolean;
  videoCrop: VideoCrop;
  sourceVideoWidth: number;
  sourceVideoHeight: number;
}) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("captions");

  return (
    <div className="flex w-full min-w-0 flex-col rounded-2xl border border-white/15 bg-black/30">
      <div className="flex border-b border-white/10 px-1" role="tablist">
        {inspectorTabs.map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab
                ? "border-blue-500 text-white"
                : "border-transparent text-white/50 hover:text-white"
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "captions" && <CaptionsTab />}
      {activeTab === "video" && (
        <VideoTab
          hasVideo={hasVideo}
          videoCrop={videoCrop}
          sourceVideoWidth={sourceVideoWidth}
          sourceVideoHeight={sourceVideoHeight}
        />
      )}
      {activeTab === "background" && <BackgroundTab />}
    </div>
  );
}

function CaptionsTab() {
  const { overlay } = useOverlayStore();

  return (
    <>
      <InspectorSection title="Style">
        <Segmented
          value={overlay.subtitleStyle}
          options={subtitleStyleOptions}
          onChange={(subtitleStyle) => setOverlayState({ subtitleStyle })}
        />
        <p className="text-xs text-white/50">{subtitleStyleDescriptions[overlay.subtitleStyle]}</p>
        {overlay.subtitleStyle === "retro-karaoke" && (
          <SliderRow
            label="Long-group time"
            value={overlay.retroKaraokeLengthInfluence}
            min={0}
            max={2}
            step={0.1}
            decimals={1}
            unit="×"
            onChange={(retroKaraokeLengthInfluence) =>
              setOverlayState({ retroKaraokeLengthInfluence })
            }
          />
        )}
      </InspectorSection>
      <InspectorSection
        title="Layout"
        onReset={() =>
          setOverlayState({ sizeMultiplier: 1, verticalPosition: 200, flipSubtitleRows: false })
        }
      >
        <SliderRow
          label="Size"
          value={overlay.sizeMultiplier}
          min={0.1}
          max={10}
          step={0.1}
          decimals={1}
          unit="×"
          onChange={(sizeMultiplier) => setOverlayState({ sizeMultiplier })}
        />
        <InspectorRow label="Position Y">
          <NumberField
            label="Y"
            value={overlay.verticalPosition}
            min={0}
            max={(overlay.isLandscapeMode ? 1080 : 1920) - 1}
            onChange={(verticalPosition) => setOverlayState({ verticalPosition })}
          />
          <span className="text-xs text-white/60">px</span>
        </InspectorRow>
        <InspectorRow label="Romanization">
          <Toggle
            checked={overlay.subtitleStyle === "brain-rot" ? false : overlay.transliterationEnabled}
            disabled={overlay.subtitleStyle !== "learning-cards"}
            onChange={(transliterationEnabled) => setOverlayState({ transliterationEnabled })}
          />
        </InspectorRow>
        <InspectorRow label="Flip rows">
          <Toggle
            checked={overlay.flipSubtitleRows}
            onChange={(flipSubtitleRows) => setOverlayState({ flipSubtitleRows })}
          />
        </InspectorRow>
      </InspectorSection>
      <details className="group border-t border-white/10">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold tracking-wide text-white/50 uppercase hover:text-white">
          <span className="inline-block transition-transform group-open:rotate-90">▸</span> Advanced
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3">
          <InspectorRow label="Per-line sizes">
            <Toggle
              checked={overlay.separateTextSizes}
              onChange={(separateTextSizes) => setOverlayState({ separateTextSizes })}
            />
          </InspectorRow>
          {overlay.separateTextSizes && (
            <>
              {(
                [
                  ["sourceTextSize", "Subtitle text"],
                  ["romanizationTextSize", "Romanization"],
                  ["translationTextSize", "Translation"],
                ] as const
              ).map(([key, label]) => (
                <SliderRow
                  key={key}
                  label={label}
                  value={overlay[key]}
                  min={0.1}
                  max={3}
                  step={0.1}
                  decimals={1}
                  unit="×"
                  disabled={key === "romanizationTextSize" && overlay.subtitleStyle === "brain-rot"}
                  onChange={(value) => setOverlayState({ [key]: value })}
                />
              ))}
              <p className="text-xs text-white/50">These multiply the main size.</p>
            </>
          )}
        </div>
      </details>
    </>
  );
}

function VideoTab({
  hasVideo,
  videoCrop,
  sourceVideoWidth,
  sourceVideoHeight,
}: {
  hasVideo: boolean;
  videoCrop: VideoCrop;
  sourceVideoWidth: number;
  sourceVideoHeight: number;
}) {
  const { overlay } = useOverlayStore();
  const userVideoScale = overlay.videoScale || 1;

  return (
    <>
      <InspectorSection
        title="Transform"
        onReset={() => setOverlayState({ videoScale: 1, videoOffsetX: 0, videoOffsetY: 0 })}
      >
        <SliderRow
          label="Scale"
          value={userVideoScale}
          min={0.25}
          max={3}
          step={0.01}
          decimals={2}
          unit="×"
          onChange={(videoScale) => setOverlayState({ videoScale })}
        />
        <InspectorRow label="Position">
          <div className="grid w-full grid-cols-2 gap-2">
            <NumberField
              label="X"
              value={overlay.videoOffsetX}
              onChange={(videoOffsetX) => setOverlayState({ videoOffsetX })}
            />
            <NumberField
              label="Y"
              value={overlay.videoOffsetY}
              onChange={(videoOffsetY) => setOverlayState({ videoOffsetY })}
            />
          </div>
        </InspectorRow>
        {!overlay.isLandscapeMode && (
          <InspectorRow label="Anchor">
            <Segmented
              value={overlay.videoPosition === "center" ? "center" : "top"}
              options={[
                ["top", "Top"],
                ["center", "Center"],
              ]}
              onChange={(videoPosition) => setOverlayState({ videoPosition })}
            />
          </InspectorRow>
        )}
      </InspectorSection>
      <InspectorSection
        title="Crop"
        onReset={() =>
          setOverlayState({
            videoCropTop: 0,
            videoCropBottom: 0,
            videoCropLeft: 0,
            videoCropRight: 0,
          })
        }
      >
        {!hasVideo && <p className="text-xs text-white/50">Load a video to crop it.</p>}
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="T"
            value={videoCrop.top}
            min={0}
            max={Math.max(0, sourceVideoHeight - videoCrop.bottom - 1)}
            disabled={!hasVideo}
            onChange={(videoCropTop) => setOverlayState({ videoCropTop })}
          />
          <NumberField
            label="B"
            value={videoCrop.bottom}
            min={0}
            max={Math.max(0, sourceVideoHeight - videoCrop.top - 1)}
            disabled={!hasVideo}
            onChange={(videoCropBottom) => setOverlayState({ videoCropBottom })}
          />
          <NumberField
            label="L"
            value={videoCrop.left}
            min={0}
            max={Math.max(0, sourceVideoWidth - videoCrop.right - 1)}
            disabled={!hasVideo}
            onChange={(videoCropLeft) => setOverlayState({ videoCropLeft })}
          />
          <NumberField
            label="R"
            value={videoCrop.right}
            min={0}
            max={Math.max(0, sourceVideoWidth - videoCrop.left - 1)}
            disabled={!hasVideo}
            onChange={(videoCropRight) => setOverlayState({ videoCropRight })}
          />
        </div>
        <p className="text-xs text-white/50">Pixels trimmed from each edge of the source video.</p>
      </InspectorSection>
    </>
  );
}

function BackgroundTab() {
  const { overlay } = useOverlayStore();

  return (
    <InspectorSection title="Background">
      <Segmented
        value={overlay.backgroundMode}
        options={[
          ["colour", "Colour"],
          ["full-image", "Image"],
          ["double-image", "Split"],
        ]}
        onChange={(backgroundMode) => setOverlayState({ backgroundMode })}
      />
      {overlay.backgroundMode === "colour" && (
        <InspectorRow label="Colour">
          <input
            type="color"
            className="h-7 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
            value={overlay.colour || "#000000"}
            onChange={(event) => setOverlayState({ colour: event.target.value })}
          />
          <span className="text-xs text-white/60 uppercase tabular-nums">
            {overlay.colour || "#000000"}
          </span>
        </InspectorRow>
      )}
      {overlay.backgroundMode === "full-image" && (
        <>
          <InspectorRow label="Image">
            <ImagePicker
              hasImage={overlay.backgroundImage !== null}
              onPick={(backgroundImage) => setOverlayState({ backgroundImage })}
            />
          </InspectorRow>
          <SliderRow
            label="Offset Y"
            value={overlay.backgroundImageOffsetY}
            min={0}
            max={3000}
            step={1}
            unit="px"
            onChange={(backgroundImageOffsetY) => setOverlayState({ backgroundImageOffsetY })}
          />
          <SliderRow
            label="Blur"
            value={overlay.backgroundImageBlur}
            min={0}
            max={50}
            step={1}
            unit="px"
            onChange={(backgroundImageBlur) => setOverlayState({ backgroundImageBlur })}
          />
        </>
      )}
      {overlay.backgroundMode === "double-image" && (
        <>
          <InspectorRow label="Layer">
            <Segmented
              value={overlay.doubleImageLayer}
              options={[
                ["under", "Under video"],
                ["over", "Over video"],
              ]}
              onChange={(doubleImageLayer) => setOverlayState({ doubleImageLayer })}
            />
          </InspectorRow>
          {(
            [
              ["image1", "Top image"],
              ["image2", "Bottom image"],
            ] as const
          ).map(([imageKey, label]) => (
            <div key={imageKey} className="flex flex-col gap-3 rounded-xl bg-white/5 p-2.5">
              <InspectorRow label={label}>
                <ImagePicker
                  hasImage={overlay.doubleBackgroundImage[imageKey] !== null}
                  onPick={(url) =>
                    setOverlayState({
                      doubleBackgroundImage: { ...overlay.doubleBackgroundImage, [imageKey]: url },
                    })
                  }
                />
              </InspectorRow>
              <SliderRow
                label="Offset Y"
                value={overlay.doubleBackgroundImageOffsetY[imageKey]}
                min={-1500}
                max={1500}
                step={1}
                unit="px"
                onChange={(value) =>
                  setOverlayState({
                    doubleBackgroundImageOffsetY: {
                      ...overlay.doubleBackgroundImageOffsetY,
                      [imageKey]: value,
                    },
                  })
                }
              />
              <SliderRow
                label="Blur"
                value={overlay.doubleBackgroundImageBlur[imageKey]}
                min={0}
                max={50}
                step={1}
                unit="px"
                onChange={(value) =>
                  setOverlayState({
                    doubleBackgroundImageBlur: {
                      ...overlay.doubleBackgroundImageBlur,
                      [imageKey]: value,
                    },
                  })
                }
              />
            </div>
          ))}
        </>
      )}
    </InspectorSection>
  );
}
