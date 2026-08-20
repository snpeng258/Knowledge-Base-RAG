export const EXIT = {
  ok: 0,
  error: 1,
  usage: 2,
  unavailable: 3,
  notFound: 4,
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
