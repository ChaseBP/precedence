import { getRace, getEventsSince } from "@/lib/precedence/store/repositories";
import { subscribeEvents } from "@/lib/precedence/orchestrator/events";
import { isTerminal } from "@/lib/precedence/orchestrator/lifecycle";
import type { LifecycleEvent } from "@/lib/precedence/types";

/**
 * GET /api/races/:id/events — Server-Sent Events stream of lifecycle events.
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

      const r = await getRace(id);
      if (r && isTerminal(r.status)) {
        try {
          controller.close();
        } catch {}
        return;
      }

      // Live subscription
      unsub = subscribeEvents(id, (ev) => {
        send(ev);
        if (isTerminal(ev.phase)) {
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
