import { MAX_TERMS_PER_PACK, MAX_TERM_LENGTH } from '../lib/customPacks';
import type { ParsedTerms } from '../lib/customTerms';

/**
 * Shared per-line feedback for every place terms are edited: session-only custom terms,
 * Cloak List editors, and the Custom Pack terms area. Over-length and
 * over-limit terms are skipped WHOLE (never truncated or silently kept), so
 * the counts here always match what will actually be cloaked.
 */
export function TermsFeedback({ analysis }: { analysis: ParsedTerms }) {
  const lines = (nums: number[]) => nums.join(', ');
  return (
    <div className="terms-feedback" aria-live="polite">
      <span className="detected-count">
        {analysis.terms.length} valid term{analysis.terms.length === 1 ? '' : 's'}
      </span>
      {analysis.duplicates.length > 0 && (
        <span className="terms-warn">
          duplicates on line{analysis.duplicates.length === 1 ? '' : 's'} {lines(analysis.duplicates)}
        </span>
      )}
      {analysis.tooShort.length > 0 && (
        <span className="terms-warn">
          too short (min 2 chars) on line{analysis.tooShort.length === 1 ? '' : 's'}{' '}
          {lines(analysis.tooShort)}
        </span>
      )}
      {analysis.tooLong.length > 0 && (
        <span className="terms-warn">
          too long (max {MAX_TERM_LENGTH} chars, skipped whole) on line
          {analysis.tooLong.length === 1 ? '' : 's'} {lines(analysis.tooLong)}
        </span>
      )}
      {analysis.overLimit.length > 0 && (
        <span className="terms-warn">
          over the {MAX_TERMS_PER_PACK}-term limit (ignored) on line
          {analysis.overLimit.length === 1 ? '' : 's'} {lines(analysis.overLimit)}
        </span>
      )}
    </div>
  );
}
