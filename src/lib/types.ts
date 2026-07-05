/** Shared types for the CloakGuard scan engine. */

export type Category = 'secrets' | 'infrastructure' | 'personal' | 'paths';

export type Severity = 'high' | 'medium' | 'low';

export type Confidence = 'high' | 'medium' | 'low';

/** A raw regex hit before overlap resolution and placeholder assignment. */
export interface RawMatch {
  /** Inclusive start offset into the source text. */
  start: number;
  /** Exclusive end offset into the source text. */
  end: number;
  /** The exact matched value (kept in memory only, never logged). */
  value: string;
  confidence: Confidence;
}

/** A single detection rule. Each detector stays small and independently testable. */
export interface Detector {
  id: string;
  /** Human-readable rule name shown in the findings list. */
  name: string;
  category: Category;
  severity: Severity;
  /** Placeholder label, e.g. 'EMAIL' produces [EMAIL_1], [EMAIL_2], ... */
  label: string;
  /**
   * Optional detector-specific placeholder template. Used by session custom
   * terms and Cloak Lists; registry detectors keep the scan-wide format.
   */
  placeholderTemplate?: string;
  /**
   * Overlap priority. When two findings overlap, the higher-priority
   * (more specific) detector wins. Ties fall back to confidence, then length.
   */
  priority: number;
  /** One-line explanation of why this match is risky. */
  explanation: string;
  /**
   * Rules only active in the Strict profile. They are context-based but more
   * aggressive than the Balanced set, so they stay opt-in.
   */
  strictOnly?: boolean;
  /**
   * Regional rules that neither Core mode enables — they only run when a
   * policy pack (or an explicit override) turns them on.
   */
  packOnly?: boolean;
  detect(text: string): RawMatch[];
  /**
   * Optional value normalizer used ONLY for placeholder reuse, e.g. private
   * terms lowercase their value so "Contoso" and "contoso" share a placeholder.
   */
  normalizeValue?(value: string): string;
}

/** A resolved finding presented to the user. */
export interface Finding {
  id: string;
  detectorId: string;
  name: string;
  category: Category;
  severity: Severity;
  confidence: Confidence;
  explanation: string;
  start: number;
  end: number;
  /** Exact matched value. Memory-only; UI must render maskValue(value) instead. */
  value: string;
  /** Assigned placeholder, e.g. [EMAIL_1]. Identical values share a placeholder. */
  placeholder: string;
  /** Whether this finding will be replaced in the cleaned output. */
  enabled: boolean;
}
