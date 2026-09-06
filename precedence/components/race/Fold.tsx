"use client";

/**
 * A card whose contents are one click away.
 *
 * @remarks Built on `<details>` rather than a `useState` toggle, and that is the whole point. It
 * is keyboard-operable with no handlers, it is announced correctly by a screen reader with no ARIA
 * to maintain, it survives a print to PDF with the section expanded, and browser find-in-page can
 * reveal text inside a closed one — which matters here, because what folds on this page is a list
 * of transaction hashes somebody may well be searching for.
 *
 * Used for evidence, never for the live state. Anything a viewer needs in order to know whether a
 * settlement is still progressing stays open; anything they need only when checking a claim can
 * fold. Getting that boundary wrong is how a page becomes a stack of closed bars that looks dead
 * during a seven-minute wait.
 *
 * The summary line carries a count, so the fold advertises what is inside it rather than making a
 * reader open it to find out whether it is worth opening.
 */

import { ChevronRight } from "lucide-react";
import { Card, Eyebrow } from "@/components/ui";

export function Fold({
  title,
  count,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Shown beside the title, e.g. the number of receipts. Omit when there is nothing to count. */
  count?: number | string;
  /** One short line explaining what folding this costs the reader. */
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-0">
      <details open={defaultOpen} className="group">
        {/* `list-none` plus the WebKit pseudo-element: Safari draws its own disclosure triangle
            and ignores the standard property, so both are needed or the card gets two markers. */}
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            size={13}
            className="shrink-0 transition-transform duration-200 group-open:rotate-90"
            style={{ color: "var(--text-faint)" }}
          />
          <span className="min-w-0 flex-1">
            <Eyebrow>{title}</Eyebrow>
          </span>
          {count !== undefined ? (
            <span className="mono shrink-0 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              {count}
            </span>
          ) : null}
        </summary>
        <div className="px-4 pb-4">
          {hint ? (
            <p className="mb-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              {hint}
            </p>
          ) : null}
          {children}
        </div>
      </details>
    </Card>
  );
}
