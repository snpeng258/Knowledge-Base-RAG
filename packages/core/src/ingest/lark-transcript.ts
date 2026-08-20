export type TranscriptUtterance = {
  speaker: string;
  tsStart: number;
  text: string;
};

const SPEAKER_LINE = /^(.+?)\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)\s*$/;

export function timestampToSeconds(stamp: string): number {
  const [hours, minutes, seconds] = stamp.split(":");
  if (hours === undefined || minutes === undefined || seconds === undefined) {
    throw new Error(`invalid timestamp: ${stamp}`);
  }
  return Number(hours) * 3600 + Number(minutes) * 60 + Math.floor(Number(seconds));
}

export function parseMinutesTranscript(raw: string): TranscriptUtterance[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const utterances: TranscriptUtterance[] = [];
  let current: TranscriptUtterance | undefined;

  const flush = (): void => {
    if (current === undefined) {
      return;
    }
    const text = current.text.replace(/^\n+|\n+$/g, "");
    if (text.length > 0) {
      utterances.push({ ...current, text });
    }
    current = undefined;
  };

  for (const line of lines) {
    const match = line.match(SPEAKER_LINE);
    if (match !== null && match[1] !== undefined && match[2] !== undefined) {
      flush();
      current = { speaker: match[1].trim(), tsStart: timestampToSeconds(match[2]), text: "" };
      continue;
    }
    if (current === undefined) {
      continue;
    }
    current.text = current.text.length === 0 ? line : `${current.text}\n${line}`;
  }
  flush();
  return utterances;
}

export function documentFromUtterances(utterances: TranscriptUtterance[]): {
  content: string;
  pieces: Array<{ text: string; charStart: number; charEnd: number; speaker: string; tsStart: number }>;
} {
  let content = "";
  const pieces: Array<{ text: string; charStart: number; charEnd: number; speaker: string; tsStart: number }> = [];
  for (const utterance of utterances) {
    if (content.length > 0) {
      content += "\n";
    }
    const charStart = content.length;
    content += utterance.text;
    pieces.push({
      text: utterance.text,
      charStart,
      charEnd: content.length,
      speaker: utterance.speaker,
      tsStart: utterance.tsStart,
    });
  }
  return { content, pieces };
}

export function meetingDocumentId(title: string, minuteToken: string): string {
  const stem = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = minuteToken.replace(/[^a-z0-9]/gi, "").slice(-8).toLowerCase() || "minutes";
  return `mtg-${stem.length > 0 ? stem : "minutes"}-${suffix}`;
}
