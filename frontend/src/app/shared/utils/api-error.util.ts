/**
 * Turn an HttpErrorResponse into something a toast can show a human.
 *
 * The case that matters is the NestJS global ValidationPipe: it answers 400 with
 * `message` as an ARRAY of per-field complaints, not a string. Passing that
 * straight to a toast typed `string` renders a comma-mashed wall that reads like
 * noise, so the refusal registers as "something went wrong" at best — which is
 * how the FaceDesk settings page hid a payload mismatch for months (#591).
 *
 * Only the first few are shown. When ten fields are rejected the first two say
 * as much about the cause as all ten, and a toast nobody can read is a toast
 * nobody reads.
 */
const MAX_DETAILS = 3;

export function describeApiError(err: unknown, fallback = 'Please try again.'): string {
  const body = (err as { error?: unknown })?.error;
  const message = (body as { message?: unknown })?.message;

  if (Array.isArray(message)) {
    const parts = message.filter((m): m is string => typeof m === 'string' && !!m.trim());
    if (!parts.length) return fallback;
    const shown = parts.slice(0, MAX_DETAILS).join('; ');
    return parts.length > MAX_DETAILS
      ? `${shown} (+${parts.length - MAX_DETAILS} more)`
      : shown;
  }

  if (typeof message === 'string' && message.trim()) return message;
  if (typeof body === 'string' && body.trim()) return body;

  // No body worth showing. A bare status is still more use than "try again":
  // 0 means the request never landed, which is a different problem entirely.
  const status = (err as { status?: unknown })?.status;
  if (status === 0) return 'Could not reach the server.';
  if (typeof status === 'number' && status > 0) return `${fallback} (HTTP ${status})`;
  return fallback;
}
