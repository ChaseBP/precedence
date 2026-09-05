import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * The 404.
 *
 * @remarks There was none, so a mistyped URL fell through to Next's default: an unthemed white
 * page with black text and no way back. In dark mode that is a full-brightness flash, and in any
 * mode it looks like the application fell over rather than that a page is missing.
 *
 * A server component on purpose — this renders for routes that never reach the app shell, so it
 * cannot depend on any client provider being mounted. The theme still applies because the
 * pre-paint script on `<html>` has already set the class by the time this paints.
 */
export default function NotFound() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ background: "var(--bg-0)", color: "var(--text)" }}
    >
      <Logo size={34} />
      <p className="mono mt-6 text-[0.7rem] uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
        404
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
        That page does not exist
      </h1>
      <p className="mt-3 max-w-[52ch] text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
        The address may be mistyped, or the facility it pointed to may have been removed. Nothing
        has gone wrong with the protocol.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href="/collateral" className="btn-accent px-5 py-3 text-sm font-semibold">
          Browse facilities
        </Link>
        <Link href="/" className="btn-ghost rounded-lg px-4 py-3 text-sm font-medium">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
