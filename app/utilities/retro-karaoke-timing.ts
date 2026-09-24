export type RetroKaraokeCaption = { chinese: string };

export function getRetroKaraokeCueKey(startTime: number, endTime: number) {
  return `${startTime.toFixed(3)}-${endTime.toFixed(3)}`;
}

export function getRetroKaraokeWeights(
  captions: RetroKaraokeCaption[],
  lengthInfluence: number,
  multipliers: Record<number, number> = {},
) {
  return captions.map((caption, index) => {
    const length = Math.max(1, Array.from(caption.chinese.trim()).length);
    const automaticWeight = 1 + (length - 1) * Math.max(0, lengthInfluence);
    return automaticWeight * Math.max(0.25, multipliers[index] ?? 1);
  });
}

/**
 * Convert line progress into progress for each syllable. Longer caption groups get
 * more time automatically, while a per-syllable multiplier handles sung holds.
 */
export function getRetroKaraokeCellProgresses(
  captions: RetroKaraokeCaption[],
  progress: number,
  lengthInfluence: number,
  multipliers: Record<number, number> = {},
) {
  const weights = getRetroKaraokeWeights(captions, lengthInfluence, multipliers);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const elapsedWeight = Math.min(1, Math.max(0, progress)) * totalWeight;

  let cellStart = 0;
  return weights.map((weight) => {
    const cellProgress = (elapsedWeight - cellStart) / weight;
    cellStart += weight;
    return Math.min(1, Math.max(0, cellProgress));
  });
}
