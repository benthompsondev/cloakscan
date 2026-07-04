import { useState } from 'react';
import type { SessionState } from '../lib/session';
import type { FindingGroup } from '../lib/groups';
import { analyzePrivateTerms } from '../lib/customTerms';
import { isCloakList } from '../lib/customPacks';
import { packById } from '../lib/packs';
import type { ProfileConfig } from '../lib/profiles';
import type { Notice, ScanMeta, Workspace } from '../App';
import { SourcePanel } from './SourcePanel';
import { PreviewPanel } from './PreviewPanel';
import { FindingsPanel } from './FindingsPanel';
import { ScanSummary } from './ScanSummary';
import { PrivateTermsDialog } from './PrivateTermsDialog';

interface ScanViewProps {
  session: SessionState;
  groups: FindingGroup[];
  cleanText: string;
  scanMeta: ScanMeta | null;
  workspace: Workspace;
  activeConfig: ProfileConfig;
  enabledCount: number;
  totalCount: number;
  onSource: (text: string) => void;
  onUpdateTerms: (patch: Partial<SessionState>) => void;
  onScan: () => void;
  onToggleGroup: (ids: readonly string[], enabled: boolean) => void;
  onSelectProfile: (id: string) => void;
  onClear: () => void;
  onNotice: (notice: Notice) => void;
}

export function ScanView({
  session,
  groups,
  cleanText,
  scanMeta,
  workspace,
  activeConfig,
  enabledCount,
  totalCount,
  onSource,
  onUpdateTerms,
  onScan,
  onToggleGroup,
  onSelectProfile,
  onClear,
  onNotice,
}: ScanViewProps) {
  const [termsOpen, setTermsOpen] = useState(false);
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
            <option value="balanced">Balanced</option>
            <option value="strict">Strict</option>
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
        <span className="toolbar-spacer" aria-hidden="true" />
        <button type="button" className="btn btn-ghost" onClick={() => setTermsOpen(true)}>
          Hide custom terms{termCount > 0 ? ` (${termCount})` : ''}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClear}>
          Clear session
        </button>
      </div>

      <div className="columns">
        <SourcePanel
          value={session.sourceText}
          findings={session.findings}
          hasScanned={session.hasScanned}
          onChange={onSource}
          onScan={onScan}
          onNotice={onNotice}
        />
        <PreviewPanel
          hasScanned={session.hasScanned}
          sourceText={session.sourceText}
          findings={session.findings}
          cleanText={cleanText}
          onNotice={onNotice}
        />
      </div>

      {session.hasScanned && (
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
