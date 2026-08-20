export const EXIT = {
  ok: 0,
  error: 1,
  usage: 2,
  unavailable: 3,
  notFound: 4,
  partial: 5,
} as const;

export class CliExit extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "CliExit";
    this.code = code;
  }
}

export function usage(message: string): never {
  throw new CliExit(EXIT.usage, message);
}

export function batchIngestExit(successCount: number, failCount: number): number {
  if (failCount > 0 && successCount > 0) {
    return EXIT.partial;
  }
  if (failCount > 0) {
    return EXIT.error;
  }
  return EXIT.ok;
}
