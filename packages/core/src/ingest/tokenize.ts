const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

export function tokenizeForSearch(text: string): string {
  const tokens: string[] = [];
  for (const part of segmenter.segment(text)) {
    if (part.isWordLike) {
      tokens.push(part.segment);
    }
  }
  return tokens.join(" ");
}
