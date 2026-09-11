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
};

function normalizeCropValue(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function getClampedVideoCrop(top: number, bottom: number, videoHeight: number): VideoCrop {
  const normalizedHeight = Math.max(1, Math.floor(videoHeight));
  const clampedTop = Math.min(normalizeCropValue(top), normalizedHeight - 1);
  const clampedBottom = Math.min(normalizeCropValue(bottom), normalizedHeight - clampedTop - 1);

  return { top: clampedTop, bottom: clampedBottom };
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
