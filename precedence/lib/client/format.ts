export const usd = (n: number | undefined, dp = 0): string =>
  n === undefined ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export const pct = (n: number | undefined, dp = 1): string => (n === undefined ? "—" : `${n.toFixed(dp)}%`);

export function riskColor(label: string): string {
  if (label === "High") return "var(--danger)";
  if (label === "Medium") return "var(--warn)";
  return "var(--success)";
}

export function trancheColor(tranche: string): string {
  switch (tranche?.toUpperCase()) {
    case "SENIOR":
      return "var(--rank-senior)";
    case "JUNIOR":
      return "var(--rank-junior)";
    case "SUBORDINATE":
      return "var(--rank-subordinate)";
    default:
      return "var(--silver)";
  }
}

export function proofStatusColor(status: string): string {
  switch (status) {
    case "PENDING_EVIDENCE":
      return "var(--proof-pending)";
    case "PROOF_AVAILABLE":
      return "var(--proof-available)";
    case "VERIFIED":
      return "var(--proof-verified)";
    default:
      return "var(--silver)";
  }
}

export function encumbranceColor(status: string): string {
  switch (status?.toUpperCase()) {
    case "CLEAR":
      return "var(--state-clear)";
    case "ENCUMBERED":
      return "var(--state-encumbered)";
    case "BREACHED":
      return "var(--state-breached)";
    case "REFINANCED":
      return "var(--event-refinance)";
    case "REPAID":
      return "var(--state-clear)";
    default:
      return "var(--silver)";
  }
}

/** Stable per-financier accent color. */
const AGENT_COLORS: Record<string, string> = {
  meridian: "var(--rank-senior)",
  vector: "var(--rank-junior)",
  novum: "var(--rank-subordinate)",
  kestrel: "var(--accent)",
};

export function agentColor(id: string): string {
  return AGENT_COLORS[id.toLowerCase()] ?? "var(--accent)";
}

export function levelColor(level: string): string {
  switch (level) {
    case "success":
      return "var(--success)";
    case "warn":
      return "var(--warn)";
    case "error":
      return "var(--danger)";
    default:
      return "var(--silver)";
  }
}

export const timeOf = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
};

export const dateOf = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
};
