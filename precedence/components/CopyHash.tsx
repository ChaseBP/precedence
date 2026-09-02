"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

/** A full on-chain identifier (never truncated) with click-to-copy + optional explorer link. */
export function CopyHash({ value, href, className = "" }: { value: string; href?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <button type="button" onClick={copy} title="Click to copy" className="hash flex-1 cursor-pointer text-left" style={{ transition: "color 0.15s" }}>
        {value}
      </button>
      <span className="mt-px flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={copy} aria-label="Copy to clipboard" title="Copy" className="opacity-50 transition-opacity hover:opacity-100">
          {copied ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
        </button>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" aria-label="View on explorer" title="View on explorer" style={{ color: "var(--accent)" }}>
            <ExternalLink size={12} />
          </a>
        ) : null}
      </span>
    </div>
  );
}
