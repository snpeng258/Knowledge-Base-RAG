export class NotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class DependencyError extends Error {
  readonly code = "dependency" as const;
  constructor(message: string) {
    super(message);
    this.name = "DependencyError";
  }
}

export function isUnavailableMessage(message: string): boolean {
  return /ECONNREFUSED|CONNECT_TIMEOUT|connect_timeout|connection refused|ENOTFOUND|ECONNRESET|EPIPE|password authentication failed|database .* does not exist/i.test(
    message,
  );
}

export function wrapIfUnavailable(error: unknown, context: string): never {
  if (error instanceof DependencyError || error instanceof NotFoundError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (isUnavailableMessage(message)) {
    throw new DependencyError(`${context}: ${message}`);
  }
  throw error instanceof Error ? error : new Error(`${context}: ${message}`);
}

export function toDependencyError(error: unknown, context: string): never {
  wrapIfUnavailable(error, context);
}
