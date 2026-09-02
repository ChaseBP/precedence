import type { CSSProperties, ReactNode } from "react";
import { agentColor } from "@/lib/client/format";

/**
 * Semantic log colorizer for PRECEDENCE:
 *  - hashes / addresses dim (verifiable proof data)
 *  - $ / % tinted by sign
 *  - protocol keywords / precompiles accent
 *  - financier agent names (Meridian, Vector, Novum, Kestrel) in distinct colors.
 */
const TOKEN =
  /(0x[0-9a-fA-F]{6,}|[1-9A-HJ-NP-Za-km-z]{24,})|([+\-−]?\$[\d,]+(?:\.\d+)?|[+\-−]?\d+(?:\.\d+)?%)|(\b(?:0x0FD2|0x0FD3|waitUntilHeightAttested|getBatchProof|verifyBatch|verifySingle|PriorityVault|AttestationGate|PriorityEngine|CollateralRegistry|RefinanceEngine|settlePriority|releaseLien|executeAtomic|lock|draw|repay|refund|senior|junior|subordinate|encumbered|clear|refinance|waterfall|haircut)\b)|(\b(?:meridian|vector|novum|kestrel)\b)/gi;

export function LogLine({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = new RegExp(TOKEN.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [tok, hash, num, kw, agent] = m;
    let style: CSSProperties;

    if (hash) {
      style = { color: "var(--text-faint)" };
    } else if (num) {
      style = {
        color: tok.startsWith("+") ? "var(--success)" : tok.startsWith("-") || tok.startsWith("−") ? "var(--danger)" : "var(--accent)",
      };
    } else if (kw) {
      style = { color: "var(--accent)" };
    } else {
      style = { color: agentColor(agent.toLowerCase()), fontWeight: 600 };
    }

    parts.push(<span key={m.index} style={style}>{tok}</span>);
    last = m.index + tok.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
