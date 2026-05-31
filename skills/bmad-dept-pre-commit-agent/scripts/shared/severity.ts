import { Severity } from "./types";

export const SEVERITY_ORDER: Record<Severity, number> = {
  NONE:     0,
  LOW:      1,
  MEDIUM:   2,
  HIGH:     3,
  CRITICAL: 4,
};

export function isHigherSeverity(a: Severity, b: Severity): boolean {
  return (SEVERITY_ORDER[a] ?? 0) > (SEVERITY_ORDER[b] ?? 0);
}

export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return (SEVERITY_ORDER[severity] ?? 0) >= (SEVERITY_ORDER[threshold] ?? 0);
}
