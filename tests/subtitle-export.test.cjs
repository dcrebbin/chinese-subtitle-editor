const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
};
const {
  exportSubtitles,
  availableExportLanguages,
} = require("../app/utilities/subtitle-export.ts");
const {
  convertSrtToCaptions,
  convertCaptionsToSrt,
} = require("../app/utilities/transliteration/transliteration.ts");
const captions = [
  {
    startTime: "00:00:01,019",
    endTime: "00:00:02,981",
    text: { yue: "你好\n世界", en: "Hello, world & <friends>", jp: null },
  },
  { startTime: "00:01:00,999", endTime: "00:01:01,001", text: { yue: "再見", en: null, jp: " " } },
];
test("Langpal preserves prefixes, all languages, and editor timings", () => {
  const result = exportSubtitles(captions, { mode: "langpal" });
  assert.equal(result.content, convertCaptionsToSrt(captions));
  assert.match(result.content, /\(yue\) 你好/);
  assert.match(result.content, /\(en\) Hello/);
  const restored = convertSrtToCaptions(result.content)[0].text;
  for (const [language, text] of Object.entries(captions[0].text))
    assert.equal(restored[language], text);
});
test("Vanilla offers populated languages and exports only the selected language", () => {
  assert.deepEqual(availableExportLanguages(captions), ["yue", "en"]);
  const result = exportSubtitles(captions, { mode: "vanilla", language: "en", format: "srt" });
  assert.match(result.content, /^1\n00:00:01,019 --> 00:00:02,981\nHello/);
  assert.doesNotMatch(result.content, /\(en\)|你好|再見|^2\n/m);
  assert.equal(captions[0].startTime, "00:00:01,019");
});
test("VTT has a header, decimal timestamps, escaped text and multiline cues", () => {
  const result = exportSubtitles(captions, { mode: "vanilla", language: "en", format: "vtt" });
  assert.match(result.content, /^WEBVTT\n\n1\n00:00:01\.019 --> 00:00:02\.981/);
  assert.match(result.content, /&amp; &lt;friends&gt;/);
  const chinese = exportSubtitles(captions, { mode: "vanilla", language: "yue", format: "vtt" });
  assert.match(chinese.content, /你好\n世界/);
});
test("ASS includes a usable style, centisecond timestamps and hard line breaks", () => {
  const result = exportSubtitles(captions, { mode: "vanilla", language: "yue", format: "ass" });
  assert.match(result.content, /\[V4\+ Styles\]/);
  assert.match(result.content, /Dialogue: 0,0:00:01\.02,0:00:02\.98,Default,,0,0,0,,你好\\N世界/);
  // Rounding a very short cue must never produce a zero-duration event.
  assert.match(result.content, /Dialogue: 0,0:01:01\.00,0:01:01\.01/);
});
test("frame alignment supports fractional FPS without retiming the timeline", () => {
  const result = exportSubtitles(captions, {
    mode: "vanilla",
    language: "en",
    format: "srt",
    fps: 25,
  });
  assert.match(result.content, /00:00:01,000 --> 00:00:03,000/);
  const fractional = exportSubtitles(captions, {
    mode: "vanilla",
    language: "en",
    format: "vtt",
    fps: 29.97,
  });
  assert.match(fractional.content, /00:00:01\.034 --> 00:00:02\.970/);
  for (const fps of [0, -1, NaN, Infinity, 1001]) {
    assert.throws(
      () => exportSubtitles(captions, { mode: "vanilla", language: "en", format: "srt", fps }),
      /frame rate/,
    );
  }
});
test("empty languages, missing captions and bad timings produce helpful errors", () => {
  assert.throws(() => exportSubtitles([], { mode: "langpal" }), /no subtitles/);
  assert.throws(
    () => exportSubtitles(captions, { mode: "vanilla", language: "jp", format: "srt" }),
    /selected language/,
  );
  assert.throws(
    () =>
      exportSubtitles([{ ...captions[0], startTime: "invalid" }], {
        mode: "vanilla",
        language: "en",
        format: "srt",
      }),
    /Invalid subtitle time/,
  );
  assert.throws(
    () =>
      exportSubtitles([{ ...captions[0], endTime: "00:00:00,000" }], {
        mode: "vanilla",
        language: "en",
        format: "srt",
      }),
    /ends before/,
  );
});
test(
  "FFmpeg reads all three exported subtitle formats",
  { skip: spawnSync("ffprobe", ["-version"]).status !== 0 },
  () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "langpal-export-"));
    try {
      for (const format of ["srt", "vtt", "ass"]) {
        const result = exportSubtitles(captions, { mode: "vanilla", language: "yue", format });
        const file = path.join(directory, `subtitles.${format}`);
        fs.writeFileSync(file, result.content);
        const probe = spawnSync(
          "ffprobe",
          ["-v", "error", "-show_packets", "-show_streams", "-of", "json", file],
          { encoding: "utf8" },
        );
        assert.equal(probe.status, 0, probe.stderr);
        const parsed = JSON.parse(probe.stdout);
        assert.equal(parsed.streams[0].codec_type, "subtitle");
        assert.equal(parsed.packets.length, 2);
        assert.ok(Number(parsed.packets[0].pts_time) > 1);
        assert.ok(Number(parsed.packets[0].duration_time) > 0);
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
