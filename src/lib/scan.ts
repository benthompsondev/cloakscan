import type { Confidence, Detector, Finding, RawMatch } from './types';
import { detectors } from './detectors';
import {
  createPrivateTermsDetector,
  DEFAULT_TERMS_OPTIONS,
  type PrivateTermsDetectorOptions,
} from './customTerms';
import { findPowerShellRegexRanges } from './protectedRanges';
import { DEFAULT_TEMPLATE, renderPlaceholder } from './redaction';

interface Candidate extends RawMatch {
  detector: Detector;
}

/** Per-scan configuration. Detector definitions themselves are never mutated. */
export interface ScanOptions {
  /** Session-only literal terms; matched via an extra detector. */
  privateTerms?: string[];
  /** Matching options for the session-only custom terms. */
  termsOptions?: PrivateTermsDetectorOptions;
  /**
   * Detector ids allowed to run. Defaults to the Balanced profile: every
   * registered rule except strict-only and pack-only ones.
   */
  enabledDetectorIds?: readonly string[];
  /**
   * Additional non-registry detectors for this scan: custom labeled-field
   * rules and pack-owned cloak-term sets. They participate in normal
   * overlap resolution.
   */
  extraDetectors?: readonly Detector[];
  /** Placeholder template using {TYPE} and {INDEX}. Defaults to [{TYPE}_{INDEX}]. */
  placeholderTemplate?: string;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Resolve overlapping candidates: the more specific detector (higher priority)
 * wins, then higher confidence, then the longer match. A bearer token beats
 * the JWT inside it; an internal URL beats the hostname and IP it contains.
 */
export function resolveOverlaps(candidates: Candidate[]): Candidate[] {
  const ranked = [...candidates].sort(
    (a, b) =>
      b.detector.priority - a.detector.priority ||
      CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  );
  const kept: Candidate[] = [];
  for (const candidate of ranked) {
    if (!kept.some((k) => overlaps(k, candidate))) kept.push(candidate);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Scan text with the configured detectors and return findings in document
 * order. Identical values under the same label reuse the same placeholder
 * deterministically, whatever the template (e.g. every occurrence of one
 * email becomes [EMAIL_1] in the default format).
 */
export function scanText(text: string, options: ScanOptions = {}): Finding[] {
  const {
    privateTerms = [],
    termsOptions = DEFAULT_TERMS_OPTIONS,
    enabledDetectorIds,
    extraDetectors = [],
    placeholderTemplate = DEFAULT_TEMPLATE,
  } = options;

  const enabled = enabledDetectorIds
    ? detectors.filter((d) => enabledDetectorIds.includes(d.id))
    : detectors.filter((d) => !d.strictOnly && !d.packOnly); // Balanced default
  const activeDetectors = [
    ...enabled,
    ...extraDetectors,
    ...(privateTerms.length > 0 ? [createPrivateTermsDetector(privateTerms, termsOptions)] : []),
  ];

  const protectedRanges = findPowerShellRegexRanges(text);
  const candidates: Candidate[] = activeDetectors
    .flatMap((detector) => detector.detect(text).map((match) => ({ ...match, detector })))
    .filter((candidate) => !protectedRanges.some((range) => overlaps(candidate, range)));
  const resolved = resolveOverlaps(candidates);

  const counters = new Map<string, number>();
  const placeholderByValue = new Map<string, string>();

  return resolved.map((c, index) => {
    const normalized = c.detector.normalizeValue ? c.detector.normalizeValue(c.value) : c.value;
    const effectiveTemplate = c.detector.placeholderTemplate ?? placeholderTemplate;
    const key = `${effectiveTemplate}\u0000${c.detector.label}\u0000${normalized}`;
    let placeholder = placeholderByValue.get(key);
    if (!placeholder) {
      const next = (counters.get(c.detector.label) ?? 0) + 1;
      counters.set(c.detector.label, next);
      placeholder = renderPlaceholder(effectiveTemplate, c.detector.label, next);
      placeholderByValue.set(key, placeholder);
    }
    return {
      id: `${c.detector.id}-${index}-${c.start}`,
      detectorId: c.detector.id,
      name: c.detector.name,
      category: c.detector.category,
      severity: c.detector.severity,
      confidence: c.confidence,
      explanation: c.detector.explanation,
      start: c.start,
      end: c.end,
      value: c.value,
      placeholder,
      enabled: true,
    };
  });
}
