export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function parseTime(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value < 1e11 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.length > 0) {
    if (/^\d+$/.test(value)) {
      return parseTime(Number(value));
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function extractMinutes(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const candidates = [root?.items, data?.items, root?.minutes, data?.minutes, root?.data, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.flatMap((item) => {
        const record = asRecord(item);
        return record === undefined ? [] : [record];
      });
    }
  }
  return [];
}

export function isLarkAuthFailure(status: number | null, text: string): boolean {
  if (status === 0) {
    return false;
  }
  return /unauthorized|unauthorised|"type":\s*"authorization"|missing_scope|missing required scope|token expired|not logged in|invalid.?grant|no token/i.test(
    text,
  );
}
