import { useEffect, useRef } from 'react';
import type { SessionState } from '../lib/session';
import { analyzePrivateTerms, createPrivateTermsDetector } from '../lib/customTerms';
import { scanText } from '../lib/scan';
import { buildCleanText } from '../lib/sanitize';
import { TermsFeedback } from './TermsFeedback';
import { FormatPicker } from './settings/FormatsSection';
import {
  DEFAULT_CUSTOM_TERM_LABEL,
  sanitizePlaceholderLabel,
  templateFor,
} from '../lib/redaction';

interface QuickCloakDialogProps {
  open: boolean;
  session: SessionState;
  /** Names of active Cloak Lists / packs that contribute their own terms. */
  activeTermPacks: string[];
  remember: boolean;
  onUpdate: (patch: Partial<SessionState>) => void;
  onClose: () => void;
}

export const QUICK_CLOAK_EXAMPLE_BEFORE = 'Contoso ticket from srv-app01 about Project Nightjar';
export const QUICK_CLOAK_EXAMPLE_TERMS = ['Contoso', 'srv-app01', 'Project Nightjar'];

/**
 * Custom terms to hide: session-only exact terms. They live in React memory exactly
 * like the source text: never persisted under any setting, never logged,
 * cleared by refresh or Clear session. Reusable collections are Cloak Lists
 * (term-only custom packs) managed in Settings → Profiles & Packs.
 */
export function PrivateTermsDialog({
  open,
  session,
  activeTermPacks,
  remember,
  onUpdate,
  onClose,
}: QuickCloakDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const analysis = analyzePrivateTerms(session.privateTermsInput, session.termsCaseSensitive);
  const exampleAfter = buildCleanText(
    QUICK_CLOAK_EXAMPLE_BEFORE,
    scanText(QUICK_CLOAK_EXAMPLE_BEFORE, {
      enabledDetectorIds: [],
      extraDetectors: [
        createPrivateTermsDetector(QUICK_CLOAK_EXAMPLE_TERMS, {
          caseSensitive: session.termsCaseSensitive,
          matchInsideWords: session.termsMatchInsideWords,
          template: templateFor(session.termsFormat),
          label: session.termsLabel,
        }),
      ],
    }),
  );

  return (
    <div
      className="dialog-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Custom terms to hide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>Custom terms to hide</h2>
          <span className="terms-badge">
            Current session only · never saved{remember ? ' (even with preferences on)' : ''}
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>

        <p className="muted dialog-intro">
          Add exact words or phrases — organization names, domains, hostnames, usernames, project
          names, team names, or anything built-in detection misses. One per line, matched
          literally (never as a regular expression); common apostrophe, dash, and spacing variants
          match automatically. The default output is{' '}
          <code className="placeholder-code">[CUSTOM_TERM_n]</code>; you can change it below.
        </p>

        <textarea
          ref={textareaRef}
          className="terms-input"
          value={session.privateTermsInput}
          onChange={(e) => onUpdate({ privateTermsInput: e.target.value })}
          placeholder={'One term per line, e.g.\nContoso General\ncontoso.org\nSRV-APP01'}
          spellCheck={false}
          autoComplete="off"
          rows={6}
          aria-label="Custom terms to hide"
        />

        <TermsFeedback analysis={analysis} />

        <div className="terms-format-control">
          <h3>How these terms are cloaked</h3>
          <FormatPicker
            choice={session.termsFormat}
            onChange={(termsFormat) => onUpdate({ termsFormat })}
            compact
            showPreview={false}
            ariaLabel="Custom term redaction format"
          />
          <label>
            <strong>Placeholder label</strong>
            <input
              className="template-input"
              value={session.termsLabel}
              maxLength={20}
              spellCheck={false}
              aria-label="Custom term placeholder label"
              onChange={(event) => onUpdate({ termsLabel: event.target.value })}
              onBlur={() =>
                onUpdate({
                  termsLabel: sanitizePlaceholderLabel(
                    session.termsLabel,
                    DEFAULT_CUSTOM_TERM_LABEL,
                  ),
                })
              }
            />
          </label>
          <p className="muted">
            Letters, numbers, and underscores only. For example, CLIENT becomes CLIENT_1 in the
            indexed format.
          </p>
        </div>

        <div className="terms-toggles">
          <label className="terms-toggle-row">
            <input
              type="checkbox"
              checked={session.termsCaseSensitive}
              onChange={(e) => onUpdate({ termsCaseSensitive: e.target.checked })}
            />
            Case-sensitive matching
          </label>
          <label className="terms-toggle-row">
            <input
              type="checkbox"
              checked={session.termsMatchInsideWords}
              onChange={(e) => onUpdate({ termsMatchInsideWords: e.target.checked })}
            />
            Also match inside longer words (more aggressive)
          </label>
          <button
            type="button"
            className="btn btn-mini"
            onClick={() => onUpdate({ privateTermsInput: '' })}
          >
            Clear terms
          </button>
        </div>

        {activeTermPacks.length > 0 && (
          <p className="muted dialog-note" data-testid="active-cloak-lists">
            Also cloaking terms from: <strong>{activeTermPacks.join(', ')}</strong>
          </p>
        )}
        <p className="muted dialog-note">
          Want these terms every session?{' '}
          <a href="#/settings/profiles" onClick={onClose}>
            Manage reusable Cloak Lists
          </a>{' '}
          in Settings → Profiles & Packs.
        </p>

        <div className="terms-example">
          <span className="muted">Example with terms “Contoso”, “srv-app01”, “Project Nightjar”:</span>
          <code className="rule-preview-before">{QUICK_CLOAK_EXAMPLE_BEFORE}</code>
          <code className="rule-preview-after">{exampleAfter}</code>
        </div>
      </div>
    </div>
  );
}
