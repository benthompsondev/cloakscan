import type { Confidence, Detector, Finding, RawMatch } from './types';
import { detectors } from './detectors';
import {
  createPrivateTermsDetector,
  DEFAULT_TERMS_OPTIONS,
  type PrivateTermsDetectorOptions,
} from './customTerms';
import { findPowerShellRegexRanges } from './protectedRanges';
import { DEFAULT_TEMPLATE, renderPlaceholder } from './redaction';
import { detectionView } from './detectionView';

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
  // Kept ranges never overlap each other and are held in start order, so only
  // the two neighbours around the insertion point can conflict. Scanning the
  // whole list instead made a dense 2 MB import quadratic.
  const kept: Candidate[] = [];
  for (const candidate of ranked) {
    let low = 0;
    let high = kept.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (kept[mid].start < candidate.start) low = mid + 1;
      else high = mid;
    }
    const before = kept[low - 1];
    const after = kept[low];
    if (before && overlaps(before, candidate)) continue;
    if (after && overlaps(after, candidate)) continue;
    kept.splice(low, 0, candidate);
  }
  return kept;
}

/**
 * Give every redactable candidate in a run of overlapping matches the full
 * span of that run.
 *
 * Overlap resolution keeps exactly one candidate per region, so the losers'
 * uncovered ends stay in the output. That is partial redaction:
 * `api_key=sk-...tail` rendered as `api_key=[API_KEY_1]tail`, and
 * `Password=hunter2 and AKIA...` redacted only the AWS key while leaving
 * `hunter2` visible. Equalizing the ranges first means the specific detector
 * still wins on priority — it just covers the whole credential.
 *
 * Growing only the *contained* candidates is not enough, because the winner
 * may be a container rather than the contained match: with `[0,105]` and
 * `[10,110]` overlapping, a win by `[0,105]` left `[105,110)` visible. Merging
 * the whole run is what actually holds the invariant.
 *
 * Include cross-category overlaps: a token inside an internal URL must not
 * defeat removal of the confidential host and path. Review leads cannot grow
 * a redaction because they are deliberately inert. The winning label describes
 * the highest-priority finding; the value covers the whole sensitive region.
 */
function coverContainingMatches(text: string, candidates: Candidate[]): Candidate[] {
  const byCategory = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const category = (candidate.reviewLead ?? candidate.detector.reviewLead) ? 'review' : 'redact';
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(candidate);
    else byCategory.set(category, [candidate]);
  }

  const grown = new Map<Candidate, Candidate>();
  for (const bucket of byCategory.values()) {
    const ordered = [...bucket].sort((a, b) => a.start - b.start || b.end - a.end);
    let run: Candidate[] = [];
    let start = 0;
    let end = -1;
    const flush = () => {
      if (run.length < 2) return;
      const containsSecret = run.some((member) => (member.category ?? member.detector.category) === 'secrets');
      for (const member of run) {
        const widened = member.start !== start || member.end !== end;
        if (!widened && !containsSecret) continue;
        grown.set(member, {
          ...member, start, end, value: text.slice(start, end),
          // An identifier mapping is safe only for its original span. It must
          // never stand in for a larger credential or containing private URL.
          replacement: widened || containsSecret ? undefined : member.replacement,
        });
      }
    };
    for (const candidate of ordered) {
      if (candidate.start < end) {
        end = Math.max(end, candidate.end);
        run.push(candidate);
        continue;
      }
      flush();
      run = [candidate];
      start = candidate.start;
      end = candidate.end;
    }
    flush();
  }
  return grown.size === 0 ? candidates : candidates.map((c) => grown.get(c) ?? c);
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
  const view = detectionView(text);
  const candidates: Candidate[] = activeDetectors
    .flatMap((detector) => {
      const raw = detector.detect(text).map((match) => ({ ...match, detector }));
      if (!view) return raw;
      // Supplement raw detection rather than replacing it. Normalization must
      // never remove an existing finding or change the source used for output.
      return [...raw, ...detector.detect(view.text).map((match) => {
        const start = view.offsets[match.start];
        const end = view.offsets[match.end];
        return { ...match, start, end, value: text.slice(start, end), detector, replacement: undefined };
      })];
    })
    .filter((candidate) => {
      const protectedMatch = protectedRanges.some((range) => overlaps(candidate, range));
      if (!protectedMatch) return true;
      if ((candidate.category ?? candidate.detector.category) !== 'secrets') return false;
      // Known credential shapes still matter inside executable regex strings.
      // Generic assignments can instead be regex syntax (password=\w+).
      return candidate.detector.id !== 'secret-assignment' ||
        !/\\[dDsSwWbBpP]|\[[^\]]*\]|[.*+?{}^$|]/.test(candidate.value);
    });
  const resolved = resolveOverlaps(coverContainingMatches(text, candidates));

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
      // Cloak List mapping entries carry their own category/severity.
      category: c.category ?? c.detector.category,
      severity: c.severity ?? c.detector.severity,
      confidence: c.confidence,
      explanation: c.detector.explanation,
      start: c.start,
      end: c.end,
      value: c.value,
      placeholder,
      ...(c.replacement !== undefined ? { replacement: c.replacement } : {}),
      ...(c.reviewLead ?? c.detector.reviewLead ? { reviewLead: true } : {}),
      // Review leads start disabled: they flag things worth checking, and
      // silently rewriting them (e.g. SamAccountName) would corrupt code.
      enabled: !(c.reviewLead ?? c.detector.reviewLead),
    };
  });
}
