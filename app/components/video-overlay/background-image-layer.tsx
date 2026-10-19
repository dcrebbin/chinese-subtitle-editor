import { useEffect, useState } from "react";

import { getBackgroundImageRect } from "@/app/utilities/rendering";

/**
 * Preview of one background image, placed with the same maths as the renderer.
 * Coordinates are output pixels; the parent is the region (full frame or one half)
 * and clips anything outside it.
 */
export default function BackgroundImageLayer({
  url,
  outputWidth,
  regionTop,
  regionHeight,
  centerVertically,
  offsetX,
  offsetY,
  scale,
  blur,
  previewScale,
}: {
  url: string | null;
  outputWidth: number;
  regionTop: number;
  regionHeight: number;
  centerVertically: boolean;
  offsetX: number;
  offsetY: number;
  scale: number;
  blur: number;
  /** Preview pixels per output pixel. */
  previewScale: number;
}) {
  const [imageSize, setImageSize] = useState<{ url: string; width: number; height: number }>();

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setImageSize({ url, width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url || imageSize?.url !== url) {
    return null;
  }

  const rect = getBackgroundImageRect({
    imageWidth: imageSize.width,
    imageHeight: imageSize.height,
    regionWidth: outputWidth,
    regionTop,
    regionHeight,
    centerVertically,
    offsetX,
    offsetY,
    scale,
  });
  // The renderer draws blurred images oversized so the faded edges stay off-frame.
  const bleed = blur > 0 ? blur * 2 : 0;

  return (
    <div
      className="absolute bg-no-repeat"
      style={{
        left: `${((rect.x - bleed) / outputWidth) * 100}%`,
        top: `${((rect.y - bleed - regionTop) / regionHeight) * 100}%`,
        width: `${((rect.width + bleed * 2) / outputWidth) * 100}%`,
        height: `${((rect.height + bleed * 2) / regionHeight) * 100}%`,
        backgroundImage: `url(${url})`,
        backgroundSize: "100% 100%",
        filter: blur > 0 ? `blur(${blur * previewScale}px)` : "none",
      }}
    />
  );
}
