export type TextChunk = {
  text: string;
  charStart: number;
  charEnd: number;
  ord: number;
};

export const DEFAULT_CHUNK_TARGET_CHARS = 900;

export function splitIntoChunks(
  content: string,
  targetChars: number = DEFAULT_CHUNK_TARGET_CHARS,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let cursor = 0;
  let ord = 0;

  while (cursor < content.length) {
    while (cursor < content.length && content[cursor] === "\n") {
      cursor += 1;
    }
    if (cursor >= content.length) {
      break;
    }

    let end = Math.min(cursor + targetChars, content.length);
    if (end < content.length) {
      const breakAt = content.lastIndexOf("\n", end);
      if (breakAt > cursor) {
        end = breakAt;
      }
    }

    const text = content.slice(cursor, end);
    if (text.length > 0) {
      chunks.push({ text, charStart: cursor, charEnd: end, ord });
      ord += 1;
    }
    cursor = end;
  }

  return chunks;
}
