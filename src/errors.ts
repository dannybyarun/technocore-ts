/**
 * Base error for all technocore protocol errors.
 */
export class TechnocoreError extends Error {
  /** HTTP status code */
  readonly status: number;
  /** Raw response body */
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `HTTP ${status}: ${body}`);
    this.name = "TechnocoreError";
    this.status = status;
    this.body = body;
  }
}

/**
 * 429 — Rate limited. The body names the bucket, refill rate, and retry delay.
 */
export class RateLimitError extends TechnocoreError {
  /** Which bucket hit the limit (reads or writes) */
  readonly bucket: string | null;
  /** Seconds to wait before retrying */
  readonly retryAfter: number | null;

  constructor(body: string, retryAfter: string | null) {
    super(429, body, `Rate limited: ${body}`);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter != null ? Number(retryAfter) : null;
    // Try to extract bucket name from body
    const match = body.match(/^(reads?|writes?)/i);
    this.bucket = match ? match[1].toLowerCase() : null;
  }
}

/**
 * 422 — Duplicate message refused. Same text posted too many times in the window.
 */
export class DuplicateError extends TechnocoreError {
  constructor(body: string) {
    super(422, body, `Duplicate refused: ${body}`);
    this.name = "DuplicateError";
  }
}

/**
 * 400 — Bad request. The body names the offending field.
 */
export class BadRequestError extends TechnocoreError {
  /** The field that failed validation, if parseable */
  readonly field: string | null;

  constructor(body: string) {
    super(400, body, `Bad request: ${body}`);
    this.name = "BadRequestError";
    const match = body.match(/^400 bad (\w+)/);
    this.field = match ? match[1] : null;
  }
}

/**
 * 409 — Conditional write conflict (CAS race). The body carries the current value.
 */
export class ConflictError extends TechnocoreError {
  /** The current value that was actually stored */
  readonly currentValue: string;

  constructor(body: string) {
    super(409, body, `Conflict: value changed`);
    this.name = "ConflictError";
    this.currentValue = ConflictError.extractValue(body);
  }

  /**
   * Extract the actual current value from the 409 body.
   * The server sends:
   *   409 note <ns>/<key> changed since you read it
   *   ...
   *   current value follows (<N> chars):
   *   <actual value>
   */
  private static extractValue(body: string): string {
    const marker = "current value follows";
    const idx = body.lastIndexOf(marker);
    if (idx === -1) return body;
    const afterMarker = body.slice(idx + marker.length);
    // Skip ": <N> chars:\n"
    const colonIdx = afterMarker.indexOf(":");
    if (colonIdx === -1) return body;
    const newlineIdx = afterMarker.indexOf("\n", colonIdx);
    if (newlineIdx === -1) return body;
    return afterMarker.slice(newlineIdx + 1).trimEnd();
  }
}

/**
 * 403 — Forbidden. Writing to a non-world-writable surface (e.g. /r/events).
 */
export class ForbiddenError extends TechnocoreError {
  constructor(body: string) {
    super(403, body, `Forbidden: ${body}`);
    this.name = "ForbiddenError";
  }
}

/**
 * 431 — Too many headers (>48 headers or >8KB total).
 */
export class HeaderTooLargeError extends TechnocoreError {
  constructor(body: string) {
    super(431, body, `Headers too large: ${body}`);
    this.name = "HeaderTooLargeError";
  }
}

/**
 * Map an HTTP status to the appropriate error class.
 */
export function errorFromResponse(status: number, body: string): TechnocoreError {
  switch (status) {
    case 400:
      return new BadRequestError(body);
    case 403:
      return new ForbiddenError(body);
    case 409:
      return new ConflictError(body);
    case 422:
      return new DuplicateError(body);
    case 429:
      return new RateLimitError(body, null);
    case 431:
      return new HeaderTooLargeError(body);
    default:
      return new TechnocoreError(status, body);
  }
}
