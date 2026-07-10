import { useState } from 'react';
import type { SessionState } from '../lib/session';
import type { Finding } from '../lib/types';
import type { FindingGroup } from '../lib/groups';
import type { CloakCandidate } from '../lib/candidates';
import type { CodeWarning } from '../lib/codeWarnings';
import type { OutputMode } from '../lib/sanitize';
import { analyzePrivateTerms } from '../lib/customTerms';
import { isCloakList } from '../lib/customPacks';
import { packById } from '../lib/packs';
import { BUILT_IN_PROFILES, type ProfileConfig } from '../lib/profiles';
import type { Notice, ScanMeta, Workspace } from '../App';
import { SourcePanel } from './SourcePanel';
import { PreviewPanel } from './PreviewPanel';
import { FindingsPanel } from './FindingsPanel';
import { ScanSummary } from './ScanSummary';
import { PrivateTermsDialog } from './PrivateTermsDialog';
import { CandidatePanel } from './CandidatePanel';

interface ScanViewProps {
  session: SessionState;
  groups: FindingGroup[];
  candidates: CloakCandidate[];
  /** Findings with the output mode already applied (portfolio replacements). */
  effectiveFindings: Finding[];
  cleanText: string;
  codeWarnings: CodeWarning[];
  scanMeta: ScanMeta | null;
  workspace: Workspace;
  activeConfig: ProfileConfig;
  enabledCount: number;
  totalCount: number;
  onSource: (text: string) => void;
  onUpdateTerms: (patch: Partial<SessionState>) => void;
  onSetOutputMode: (mode: OutputMode) => void;
  onScan: () => void;
  onNewScan: () => void;
  onToggleGroup: (ids: readonly string[], enabled: boolean) => void;
  onHideCandidate: (term: string) => void;
  onDismissCandidate: (term: string) => void;
  onSelectProfile: (id: string) => void;
  onClear: () => void;
  onNotice: (notice: Notice) => void;
}

export function ScanView({
  session,
  groups,
  candidates,
  effectiveFindings,
  cleanText,
  codeWarnings,
  scanMeta,
  workspace,
  activeConfig,
  enabledCount,
  totalCount,
  onSource,
  onUpdateTerms,
  onSetOutputMode,
  onScan,
  onNewScan,
  onToggleGroup,
  onHideCandidate,
  onDismissCandidate,
  onSelectProfile,
  onClear,
  onNotice,
}: ScanViewProps) {
  const [termsOpen, setTermsOpen] = useState(false);
  const [guidanceVisible, setGuidanceVisible] = useState(true);
  const termCount = analyzePrivateTerms(session.privateTermsInput, session.termsCaseSensitive)
    .terms.length;

  const activePackChips = [
    ...activeConfig.packIds.map((id) => packById(id)?.name ?? id),
    ...activeConfig.customPackIds.map((id) => {
      const pack = workspace.customPacks.find((p) => p.id === id);
      if (!pack) return id;
      return isCloakList(pack) ? `${pack.name} · Cloak List` : pack.name;
    }),
  ];
  const activeTermPacks = workspace.customPacks.filter(
    (p) => p.enabled && activeConfig.customPackIds.includes(p.id) && p.terms.values.length > 0,
  );

  return (
    <>
      <div className="page-head">
        <h1>Sanitize sensitive text before it leaves your machine.</h1>
        <p className="muted">
          Everything runs locally on this device. Nothing is uploaded, nothing is saved.
        </p>
      </div>

      <div className="toolbar" role="group" aria-label="Scan configuration">
        <span className="toolbar-item">
          <label className="muted" htmlFor="scan-profile">
            Profile
          </label>
          <select
            id="scan-profile"
            className="profile-select"
            aria-label="Detection profile"
            value={workspace.activeProfileId}
            onChange={(e) => onSelectProfile(e.target.value)}
          >
            {BUILT_IN_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
            {workspace.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {workspace.activeProfileId === 'unsaved' && (
              <option value="unsaved">Unsaved configuration</option>
            )}
          </select>
          <span className="muted">
            · {enabledCount} of {totalCount} rules
          </span>
          <a className="toolbar-link" href="#/settings/profiles">
            Profiles & packs
          </a>
        </span>
        {activePackChips.length > 0 && (
          <span className="toolbar-packs" aria-label="Active packs">
            {activePackChips.map((name) => (
              <span key={name} className="pack-chip">
                {name}
              </span>
            ))}
          </span>
        )}
        <span className="toolbar-item mode-toggle" role="group" aria-label="Output mode">
          <span className="muted">Output</span>
          <button
            type="button"
            className={`btn btn-mini mode-btn ${session.outputMode === 'safe-share' ? 'is-active' : ''}`}
            aria-pressed={session.outputMode === 'safe-share'}
            onClick={() => onSetOutputMode('safe-share')}
          >
            Safe-share
          </button>
          <button
            type="button"
            className={`btn btn-mini mode-btn ${session.outputMode === 'portfolio-code' ? 'is-active' : ''}`}
            aria-pressed={session.outputMode === 'portfolio-code'}
            onClick={() => onSetOutputMode('portfolio-code')}
          >
            Portfolio-code
          </button>
        </span>
        <span className="toolbar-spacer" aria-hidden="true" />
        <button type="button" className="btn btn-ghost" onClick={() => setTermsOpen(true)}>
          Hide custom terms{termCount > 0 ? ` (${termCount})` : ''}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClear}>
          Clear session
        </button>
      </div>

      <p className="muted mode-helper">
        {session.outputMode === 'safe-share'
          ? 'Safe-share: everything becomes bracket placeholders like [EMAIL_1] — best for prompts, tickets, logs, and issues.'
          : 'Portfolio-code: Cloak List mappings with a replacement swap in valid generic identifiers inside code; secrets, string values, and paths still become placeholders.'}
      </p>

      {guidanceVisible && (
        <aside className="scan-guidance" role="note" aria-label="Detection reminder">
          <span className="scan-guidance-icon" aria-hidden="true">
            !
          </span>
          <span>
            <strong>Built-in rules can miss names, organizations, and work-specific details.</strong>{' '}
            Review the cleaned text before sharing. Use <strong>Hide custom terms</strong> for
            one-off matches, or{' '}
            <a href="#/settings/profiles">
              Open Cloak Lists
            </a>{' '}
            for repeatable ones.
          </span>
          <button
            type="button"
            className="scan-guidance-dismiss"
            aria-label="Hide detection reminder"
            title="Hide reminder"
            onClick={() => setGuidanceVisible(false)}
          >
            ×
          </button>
        </aside>
      )}

      <div className="columns">
        <SourcePanel
          value={session.sourceText}
          findings={session.findings}
          hasScanned={session.hasScanned}
          onChange={onSource}
          onScan={onScan}
          onNewScan={onNewScan}
          onNotice={onNotice}
        />
        <PreviewPanel
          hasScanned={session.hasScanned}
          sourceText={session.sourceText}
          findings={effectiveFindings}
          cleanText={cleanText}
          codeWarnings={codeWarnings}
          onNotice={onNotice}
        />
      </div>

      {session.hasScanned && (
        <>
          <div className="results">
            <FindingsPanel groups={groups} onToggleGroup={onToggleGroup} />
            <ScanSummary
              startedAt={scanMeta?.startedAt ?? null}
              durationMs={scanMeta?.durationMs ?? null}
              ruleCount={enabledCount}
              itemsDetected={session.findings.length}
              redactionsApplied={session.findings.filter((f) => f.enabled).length}
            />
          </div>
          {candidates.length > 0 && (
            <CandidatePanel
              candidates={candidates}
              onHideCandidate={onHideCandidate}
              onDismissCandidate={onDismissCandidate}
            />
          )}
        </>
      )}

      <PrivateTermsDialog
        open={termsOpen}
        session={session}
        activeTermPacks={activeTermPacks.map((p) => p.name)}
        remember={workspace.remember}
        onUpdate={onUpdateTerms}
        onClose={() => setTermsOpen(false)}
      />
    </>
  );
}
