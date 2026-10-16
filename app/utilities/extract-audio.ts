import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Output,
  WavOutputFormat,
} from "mediabunny";

export const MAX_ASR_AUDIO_BYTES = 24 * 1024 * 1024;

/** Decode locally and send only mono 16 kHz audio, never the source video. */
export async function extractSubtitleAudio(file: File): Promise<File> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("This video has no audio track.");
    if ((await input.computeDuration()) * 16000 * 2 + 44 > MAX_ASR_AUDIO_BYTES) {
      throw new Error(
        "This video is too long. Crop it to under 13 minutes before generating subtitles.",
      );
    }
    const target = new BufferTarget();
    const output = new Output({ target, format: new WavOutputFormat() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { codec: "pcm-s16", sampleRate: 16000, numberOfChannels: 1 },
    });
    if (!conversion.isValid)
      throw new Error("This video's audio cannot be decoded in this browser.");
    await conversion.execute();
    if (!target.buffer?.byteLength) throw new Error("Audio extraction produced no audio.");
    if (target.buffer.byteLength > MAX_ASR_AUDIO_BYTES)
      throw new Error("Extracted audio exceeds 24 MB. Crop the video and try again.");
    return new File([target.buffer], "audio.wav", { type: "audio/wav" });
  } finally {
    input.dispose();
  }
}
