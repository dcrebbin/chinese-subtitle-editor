export function beautifyLyrics(text: string): string {
  return text
    .split(/\r\n?|\n/)
    .flatMap((line) => {
      const phrases = line
        .trim()
        .split(/[^\S\r\n]+/u)
        .filter(Boolean);
      // Keep a one-character opening attached to the following phrase.
      if (phrases.length > 1 && Array.from(phrases[0]).length === 1) {
        phrases.splice(0, 2, `${phrases[0]} ${phrases[1]}`);
      }
      return phrases;
    })
    .join("\n\n");
}
