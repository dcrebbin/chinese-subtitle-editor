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
