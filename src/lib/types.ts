/** Shared types for the CloakScan scan engine. */

export type Category =
  | 'secrets'
  | 'infrastructure'
  | 'personal'
  | 'paths'
  | 'organization'
  | 'code'
  | 'workflow'
  | 'directory'
  | 'messaging';

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
  /**
   * Optional code-safe replacement (Portfolio-code mode). When present, the
   * finding can be spliced as a valid identifier instead of a placeholder.
   */
  replacement?: string;
  /** Optional per-match category override (Cloak List mapping entries). */
  category?: Category;
  /** Optional per-match severity override (Cloak List mapping entries). */
  severity?: Severity;
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
  /**
   * Review leads point at organization/workflow fingerprints worth a look,
   * not confirmed sensitive values. Their findings start DISABLED so they
   * never silently rewrite output (or corrupt code); the user opts in.
   */
  reviewLead?: boolean;
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
  /**
   * Code-safe identifier replacement, when one applies. Portfolio-code mode
   * splices this instead of the placeholder; Safe-share mode ignores it.
   */
  replacement?: string;
  /** True when this finding is a review lead (starts disabled, opt-in). */
  reviewLead?: boolean;
  /** Whether this finding will be replaced in the cleaned output. */
  enabled: boolean;
}
