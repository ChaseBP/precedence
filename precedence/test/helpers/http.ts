/**
 * Calling a route handler the way Next calls it.
 *
 * @remarks Next 16 hands a route handler a `Request` and, for a dynamic segment, a context whose
 * `params` is a **Promise**. Both are reproduced exactly rather than approximated: a handler that
 * forgot to await `params` would pass a test that handed it a plain object, and then fail in the
 * app with `id` reading `undefined`.
 */

/** The origin is arbitrary — routes only ever read the path and the query. */
const ORIGIN = "http://precedence.test";

export function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(new URL(path, ORIGIN), { method: "GET", headers });
}

export function post(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(new URL(path, ORIGIN), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A POST whose body is not JSON, which several routes have a specific answer for. */
export function postRaw(path: string, body: string, headers: Record<string, string> = {}): Request {
  return new Request(new URL(path, ORIGIN), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

/** The second argument Next passes a dynamic route. `params` is a promise, as in the real thing. */
export function ctx<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

/** Status and parsed body together, which is what almost every assertion needs. */
export async function json<T = Record<string, unknown>>(
  res: Response,
): Promise<{ status: number; body: T }> {
  return { status: res.status, body: (await res.json()) as T };
}

/**
 * Read a Server-Sent Events response into frames.
 *
 * @remarks Bounded by both a frame count and a timeout, because a *correct* stream for a race
 * that is still running never ends — that is the whole point of it. A test that waited for the
 * end would hang on the passing case, so it reads what has arrived and cancels.
 *
 * `closed` is what most of these assertions are really about: an `EventSource` cannot tell a
 * server with nothing left to send from a connection that dropped, so it reconnects roughly every
 * three seconds, forever. The stream has to say `done` and close.
 */
export async function readSse(
  res: Response,
  { limit = 200, timeoutMs = 250 }: { limit?: number; timeoutMs?: number } = {},
): Promise<{ frames: string[]; closed: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { frames: [], closed: true };
  const dec = new TextDecoder();
  let buf = "";
  const frames: string[] = [];
  let closed = false;
  const deadline = Date.now() + timeoutMs;

  while (frames.length < limit && Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), Math.max(1, deadline - Date.now()))),
    ]);
    if (next === null) break;
    if (next.value) buf += dec.decode(next.value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      frames.push(buf.slice(0, i));
      buf = buf.slice(i + 2);
    }
    if (next.done) {
      closed = true;
      break;
    }
  }
  if (!closed) await reader.cancel().catch(() => {});
  return { frames, closed };
}

/** The `event:` name of each SSE frame, in order. */
export function sseEvents(frames: string[]): string[] {
  return frames
    .map((f) => f.split("\n").find((l) => l.startsWith("event: "))?.slice(7))
    .filter((n): n is string => Boolean(n));
}
