import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

export type VideoCrop = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type CropHandle =
  | "move"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** Apply a drag in source pixels, keeping at least one pixel inside the selection. */
export function adjustVideoCrop(
  crop: VideoCrop,
  handle: CropHandle,
  deltaX: number,
  deltaY: number,
  width: number,
  height: number,
): VideoCrop {
  const next = { ...crop };
  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, value)));
  if (handle === "move") {
    const x = clamp(deltaX, -crop.left, crop.right);
    const y = clamp(deltaY, -crop.top, crop.bottom);
    return {
      left: crop.left + x,
      right: crop.right - x,
      top: crop.top + y,
      bottom: crop.bottom - y,
    };
  }
  if (handle.includes("left")) next.left = clamp(crop.left + deltaX, 0, width - crop.right - 1);
  if (handle.includes("right")) next.right = clamp(crop.right - deltaX, 0, width - crop.left - 1);
  if (handle.includes("top")) next.top = clamp(crop.top + deltaY, 0, height - crop.bottom - 1);
  if (handle.includes("bottom"))
    next.bottom = clamp(crop.bottom - deltaY, 0, height - crop.top - 1);
  return next;
}

function normalizeCropValue(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function getClampedVideoCrop(
  top: number,
  bottom: number,
  videoHeight: number,
  left = 0,
  right = 0,
  videoWidth = 1,
): VideoCrop {
  const normalizedHeight = Math.max(1, Math.floor(videoHeight));
  const clampedTop = Math.min(normalizeCropValue(top), normalizedHeight - 1);
  const clampedBottom = Math.min(normalizeCropValue(bottom), normalizedHeight - clampedTop - 1);

  const normalizedWidth = Math.max(1, Math.floor(videoWidth));
  const clampedLeft = Math.min(normalizeCropValue(left), normalizedWidth - 1);
  const clampedRight = Math.min(normalizeCropValue(right), normalizedWidth - clampedLeft - 1);

  return { top: clampedTop, bottom: clampedBottom, left: clampedLeft, right: clampedRight };
}

/** Create a new video containing only the selected time range, including its audio tracks. */
export async function cropVideoFile(file: File, start: number, end: number): Promise<File> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new Error("Choose a valid crop range before cropping the video.");
  }

  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: new Mp4OutputFormat(),
  });
  const conversion = await Conversion.init({
    input,
    output,
    trim: { start, end },
  });

  if (!conversion.isValid) {
    throw new Error("This video cannot be cropped in the current format.");
  }

  await conversion.execute();

  if (!target.buffer) {
    throw new Error("Cropping did not produce a video.");
  }

  return new File([target.buffer], "cropped-video.mp4", { type: "video/mp4" });
}
