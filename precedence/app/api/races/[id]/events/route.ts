import { getRace, getEventsSince } from "@/lib/precedence/store/repositories";
import { subscribeEvents } from "@/lib/precedence/orchestrator/events";
import { isTerminal } from "@/lib/precedence/orchestrator/lifecycle";
import type { LifecycleEvent } from "@precedence/sdk/types";

/**
 * GET /api/races/:id/events — Server-Sent Events stream of lifecycle events.
 *
 * @remarks A finished stream must say so before it closes. `EventSource` cannot tell a server that
 * has nothing left to send from a connection that dropped, so it reconnects — by default about
 * three seconds later, forever. A settled race with no stored events therefore closed instantly on
 * every attempt and the browser reopened it indefinitely: measured at six requests per twenty
 * seconds on the seeded walkthrough, for a race that had been over for days.
 *
 * The `done` event is what stops it. The client closes on receipt, so the loop ends on the one
 * side that can actually end it — calling `close()` here only ever looks like a network failure.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const url = new URL(req.url);
  const lastIdHeader = req.headers.get("last-event-id");
  const lastSeq = lastIdHeader ? Number(lastIdHeader) : Number(url.searchParams.get("sinceSeq") ?? 0);

  const enc = new TextEncoder();
  let unsub: (() => void) | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: LifecycleEvent) {
        try {
          const payload = `id: ${event.seq}\nevent: ${event.phase}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(enc.encode(payload));
        } catch {
          // stream closed
        }
      }

      // Replay existing events since lastSeq
      const historical = await getEventsSince(id, lastSeq);
      for (const ev of historical) send(ev);

      /** Tell the client this stream is finished, so it does not treat the close as a drop. */
      function sendDone() {
        try {
          controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`));
        } catch {
          // already closed
        }
      }

      const r = await getRace(id);
      // `!r` matters as much as the terminal check. A race can vanish under an open tab —
      // `POST /api/admin/reset` wipes the store — and without this the route fell through to
      // `subscribeEvents` and held a connection and a subscription open forever for an id that
      // no longer exists. The page shows "Settlement Not Found" but never unmounts, so the
      // client's own cleanup never runs either.
      if (!r || isTerminal(r.status)) {
        sendDone();
        try {
          controller.close();
        } catch {}
        return;
      }

      // Live subscription
      unsub = subscribeEvents(id, (ev) => {
        send(ev);
        if (isTerminal(ev.phase)) {
          sendDone();
          try {
            unsub?.();
            controller.close();
          } catch {}
        }
      });
    },
    cancel() {
      unsub?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
