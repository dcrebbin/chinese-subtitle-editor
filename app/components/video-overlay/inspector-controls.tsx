import type { ReactNode } from "react";

export const toolbarButtonClassName =
  "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-medium hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40";

export const inspectorButtonClassName =
  "cursor-pointer rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-medium text-white/80 shadow-sm shadow-black/30 hover:bg-white/20 hover:text-white active:translate-y-px";

export function InspectorSection({
  title,
  onReset,
  children,
}: {
  title: string;
  onReset?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-white/10 px-3 py-3 last:border-b-0">
      <div className="flex items-center justify-between">
        {onReset && (
          <button type="button" className={inspectorButtonClassName} onClick={onReset}>
            Reset
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function InspectorRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-sm">
      <span className="truncate text-white/70">{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  decimals = 0,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <InspectorRow label={label}>
      <input
        className="min-w-0 flex-1 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
      />
      <span className="w-14 shrink-0 text-right text-xs text-white/60 tabular-nums">
        {value.toFixed(decimals)}
        {unit}
      </span>
    </InspectorRow>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-sm">
      <span className="w-4 shrink-0 text-xs text-white/50">{label}</span>
      <input
        className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none disabled:opacity-40"
        type="number"
        step={1}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.valueAsNumber;
          if (!Number.isFinite(nextValue)) {
            onChange(0);
            return;
          }
          const lowerBounded = min === undefined ? nextValue : Math.max(min, nextValue);
          onChange(max === undefined ? lowerBounded : Math.min(max, lowerBounded));
        }}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex min-w-0 flex-wrap rounded-lg border border-white/15 bg-black/30 p-1">
      {options.map(([optionValue, optionLabel]) => (
        <button
          key={optionValue}
          type="button"
          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === optionValue
              ? "bg-white text-black shadow-sm"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
          onClick={() => onChange(optionValue)}
        >
          {optionLabel}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-blue-500" : "bg-white/20"
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

export function ImagePicker({
  hasImage,
  onPick,
}: {
  hasImage: boolean;
  onPick: (url: string) => void;
}) {
  return (
    <label className="cursor-pointer rounded-lg border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-semibold shadow-sm shadow-black/30 hover:bg-white/25 active:translate-y-px">
      {hasImage ? "Replace image" : "Choose image"}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const selectedFile = event.target.files?.[0];
          if (selectedFile) {
            onPick(URL.createObjectURL(selectedFile));
          }
          event.target.value = "";
        }}
      />
    </label>
  );
}
