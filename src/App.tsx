import { useMemo, useRef, useState } from 'react';
import { scanText } from './lib/scan';
import { buildCleanText } from './lib/sanitize';
import { parsePrivateTerms, createPrivateTermsDetector } from './lib/customTerms';
import { createEmptySession, type SessionState } from './lib/session';
import { groupFindings, setFindingsEnabled } from './lib/groups';
import { detectors } from './lib/detectors';
import {
  clearPreferences,
  loadPreferencesV2,
  savePreferencesV2,
} from './lib/preferences';
import {
  BALANCED_PROFILE,
  STRICT_PROFILE,
  MAX_PROFILES,
  enabledRuleIds,
  generateId,
  resolveRuleStates,
  sameConfig,
  validateName,
  type ProfileConfig,
} from './lib/profiles';
import {
  MAX_CUSTOM_PACKS,
  detectorsFromCustomPacks,
  type CustomPack,
} from './lib/customPacks';
import { templateFor, type RedactionChoice } from './lib/redaction';
import { useHashRoute } from './hooks/useHashRoute';
import { Header } from './components/Header';
import { ScanView } from './components/ScanView';
import { SettingsView } from './components/settings/SettingsView';
import { AboutView } from './components/AboutView';

export interface Notice {
  kind: 'ok' | 'err';
  text: string;
}

export interface ScanMeta {
  startedAt: Date;
  durationMs: number;
}

export interface Workspace {
  remember: boolean;
  /** 'balanced' | 'strict' | 'unsaved' | a named profile id. */
  activeProfileId: string;
  /** Session-only configuration created by modifying a built-in preset. */
  unsaved: ProfileConfig | null;
  profiles: ProfileConfig[];
  customPacks: CustomPack[];
}

function cloneConfig(config: ProfileConfig): ProfileConfig {
  return {
    ...config,
    packIds: [...config.packIds],
    customPackIds: [...config.customPackIds],
    overrides: { ...config.overrides },
    format: { ...config.format },
  };
}

export default function App() {
  const route = useHashRoute();
  const [session, setSession] = useState<SessionState>(createEmptySession);
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const stored = loadPreferencesV2();
    return stored
      ? {
          remember: true,
          activeProfileId: stored.activeProfileId,
          unsaved: null,
          profiles: stored.profiles,
          customPacks: stored.customPacks,
        }
      : { remember: false, activeProfileId: 'balanced', unsaved: null, profiles: [], customPacks: [] };
  });

  const activeConfig: ProfileConfig = useMemo(() => {
    if (workspace.activeProfileId === 'balanced') return BALANCED_PROFILE;
    if (workspace.activeProfileId === 'strict') return STRICT_PROFILE;
    if (workspace.activeProfileId === 'unsaved' && workspace.unsaved) return workspace.unsaved;
    return (
      workspace.profiles.find((p) => p.id === workspace.activeProfileId) ?? BALANCED_PROFILE
    );
  }, [workspace]);

  const resolvedStates = useMemo(
    () => resolveRuleStates(activeConfig, workspace.customPacks),
    [activeConfig, workspace.customPacks],
  );
  const enabledIds = useMemo(() => enabledRuleIds(resolvedStates), [resolvedStates]);

  const showNotice = (n: Notice) => {
    setNotice(n);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  };

  const invalidateScan = () =>
    setSession((s) => (s.hasScanned ? { ...s, findings: [], hasScanned: false } : s));

  const commit = (next: Workspace, options: { invalidate?: boolean } = {}) => {
    setWorkspace(next);
    if (next.remember) {
      savePreferencesV2({
        version: 2,
        // The unsaved configuration is session-only by definition.
        activeProfileId: next.activeProfileId === 'unsaved' ? 'balanced' : next.activeProfileId,
        profiles: next.profiles,
        customPacks: next.customPacks,
      });
    } else {
      clearPreferences();
    }
    if (options.invalidate !== false) invalidateScan();
  };

  /**
   * Apply a change to the active configuration. Built-in presets are never
   * mutated — modifying one forks it into the session-only "Unsaved
   * configuration". Named profiles are edited in place.
   */
  const updateActiveConfig = (mutate: (config: ProfileConfig) => void) => {
    if (activeConfig.builtIn) {
      const fork = cloneConfig(activeConfig);
      fork.id = 'unsaved';
      fork.name = 'Unsaved configuration';
      fork.builtIn = undefined;
      mutate(fork);
      commit({ ...workspace, activeProfileId: 'unsaved', unsaved: fork });
    } else if (workspace.activeProfileId === 'unsaved') {
      const next = cloneConfig(activeConfig);
      mutate(next);
      commit({ ...workspace, unsaved: next });
    } else {
      const next = cloneConfig(activeConfig);
      mutate(next);
      commit({
        ...workspace,
        profiles: workspace.profiles.map((p) => (p.id === next.id ? next : p)),
      });
    }
  };

  // ----- profile operations -----

  const onSelectProfile = (id: string) =>
    commit({ ...workspace, activeProfileId: id, unsaved: id === 'unsaved' ? workspace.unsaved : null });

  const onToggleRule = (id: string, enabled: boolean) =>
    updateActiveConfig((c) => {
      c.overrides = { ...c.overrides, [id]: enabled };
    });

  const onChangeFormat = (format: RedactionChoice) =>
    updateActiveConfig((c) => {
      c.format = format;
    });

  const onTogglePack = (packId: string, on: boolean) =>
    updateActiveConfig((c) => {
      c.packIds = on ? [...new Set([...c.packIds, packId])] : c.packIds.filter((p) => p !== packId);
    });

  const onToggleCustomPack = (packId: string, on: boolean) =>
    updateActiveConfig((c) => {
      c.customPackIds = on
        ? [...new Set([...c.customPackIds, packId])]
        : c.customPackIds.filter((p) => p !== packId);
    });

  const onCreateProfile = (name: string) => {
    if (validateName(name) !== null) return;
    if (workspace.profiles.length >= MAX_PROFILES) {
      showNotice({ kind: 'err', text: `At most ${MAX_PROFILES} profiles.` });
      return;
    }
    const profile = cloneConfig(activeConfig);
    profile.id = generateId('profile');
    profile.name = name.trim();
    profile.builtIn = undefined;
    commit(
      {
        ...workspace,
        profiles: [...workspace.profiles, profile],
        activeProfileId: profile.id,
        unsaved: null,
      },
      { invalidate: false },
    );
    showNotice({ kind: 'ok', text: `Profile "${profile.name}" created.` });
  };

  const onDuplicateProfile = (id: string) => {
    const source = workspace.profiles.find((p) => p.id === id);
    if (!source || workspace.profiles.length >= MAX_PROFILES) return;
    const copy = cloneConfig(source);
    copy.id = generateId('profile');
    copy.name = `${source.name} copy`.slice(0, 40);
    commit({ ...workspace, profiles: [...workspace.profiles, copy] }, { invalidate: false });
  };

  const onRenameProfile = (id: string, name: string) => {
    if (validateName(name) !== null) return;
    commit(
      {
        ...workspace,
        profiles: workspace.profiles.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)),
      },
      { invalidate: false },
    );
  };

  const onDeleteProfile = (id: string) =>
    commit({
      ...workspace,
      profiles: workspace.profiles.filter((p) => p.id !== id),
      activeProfileId: workspace.activeProfileId === id ? 'balanced' : workspace.activeProfileId,
    });

  const onResetOverrides = () =>
    updateActiveConfig((c) => {
      c.overrides = {};
    });

  /**
   * Replace one named profile with the edited version from the Profile
   * Editor. Only the matching id is touched; built-ins can never arrive here
   * because the editor only opens for profiles in workspace.profiles. Scan
   * results are invalidated only when the edited profile is ACTIVE and its
   * scanning behavior (mode/packs/overrides/format) actually changed —
   * renames and description edits keep existing results.
   */
  const onSaveProfile = (profile: ProfileConfig) => {
    const existing = workspace.profiles.find((p) => p.id === profile.id);
    if (!existing) return;
    const scanningChanged = !sameConfig(existing, profile);
    commit(
      {
        ...workspace,
        profiles: workspace.profiles.map((p) => (p.id === profile.id ? profile : p)),
      },
      { invalidate: scanningChanged && workspace.activeProfileId === profile.id },
    );
    showNotice({ kind: 'ok', text: `Profile "${profile.name}" updated.` });
  };

  // ----- custom pack operations -----

  const onSavePack = (pack: CustomPack) => {
    const exists = workspace.customPacks.some((p) => p.id === pack.id);
    if (!exists && workspace.customPacks.length >= MAX_CUSTOM_PACKS) {
      showNotice({ kind: 'err', text: `At most ${MAX_CUSTOM_PACKS} custom packs.` });
      return;
    }
    commit({
      ...workspace,
      customPacks: exists
        ? workspace.customPacks.map((p) => (p.id === pack.id ? pack : p))
        : [...workspace.customPacks, pack],
    });
  };

  const onDuplicatePack = (id: string) => {
    const source = workspace.customPacks.find((p) => p.id === id);
    if (!source || workspace.customPacks.length >= MAX_CUSTOM_PACKS) return;
    const copy: CustomPack = JSON.parse(JSON.stringify(source));
    copy.id = generateId('pack');
    copy.name = `${source.name} copy`.slice(0, 40);
    commit({ ...workspace, customPacks: [...workspace.customPacks, copy] }, { invalidate: false });
  };

  const onDeletePack = (id: string) =>
    commit({
      ...workspace,
      customPacks: workspace.customPacks.filter((p) => p.id !== id),
      profiles: workspace.profiles.map((p) => ({
        ...p,
        customPackIds: p.customPackIds.filter((x) => x !== id),
      })),
      unsaved: workspace.unsaved
        ? { ...workspace.unsaved, customPackIds: workspace.unsaved.customPackIds.filter((x) => x !== id) }
        : null,
    });

  // ----- preference storage -----

  const onSetRemember = (on: boolean) => commit({ ...workspace, remember: on }, { invalidate: false });

  const onResetDefaults = () =>
    commit({ ...workspace, activeProfileId: 'balanced', unsaved: null });

  const onClearPreferences = () => {
    clearPreferences();
    setWorkspace({
      remember: false,
      activeProfileId: 'balanced',
      unsaved: null,
      profiles: [],
      customPacks: [],
    });
    invalidateScan();
    showNotice({ kind: 'ok', text: 'Stored preferences deleted from this device.' });
  };

  // ----- scan session -----

  const cleanText = useMemo(
    () => (session.hasScanned ? buildCleanText(session.sourceText, session.findings) : ''),
    [session],
  );
  const groups = useMemo(() => groupFindings(session.findings), [session.findings]);

  const setSource = (sourceText: string) =>
    setSession((s) => ({ ...s, sourceText, findings: [], hasScanned: false }));

  const updateTerms = (patch: Partial<SessionState>) =>
    setSession((s) => ({ ...s, ...patch, findings: [], hasScanned: false }));

  const scan = () => {
    const startedAt = new Date();
    const t0 = performance.now();
    const extraDetectors = [
      ...detectorsFromCustomPacks(workspace.customPacks, activeConfig.customPackIds),
      ...workspace.customPacks
        .filter(
          (p) => p.enabled && activeConfig.customPackIds.includes(p.id) && p.terms.values.length > 0,
        )
        .map((p) =>
          createPrivateTermsDetector(p.terms.values, p.terms, `Cloak term (${p.name})`),
        ),
    ];
    setSession((s) => ({
      ...s,
      findings: scanText(s.sourceText, {
        privateTerms: parsePrivateTerms(s.privateTermsInput, s.termsCaseSensitive),
        termsOptions: {
          caseSensitive: s.termsCaseSensitive,
          matchInsideWords: s.termsMatchInsideWords,
        },
        enabledDetectorIds: enabledIds,
        extraDetectors,
        placeholderTemplate: templateFor(activeConfig.format),
      }),
      hasScanned: true,
    }));
    setScanMeta({ startedAt, durationMs: performance.now() - t0 });
  };

  const onToggleGroup = (ids: readonly string[], enabled: boolean) =>
    setSession((s) => ({ ...s, findings: setFindingsEnabled(s.findings, ids, enabled) }));

  const clearAll = () => {
    setSession(createEmptySession());
    setScanMeta(null);
    setNotice(null);
  };

  const settingsProps = {
    workspace,
    activeConfig,
    resolvedStates,
    onSelectProfile,
    onToggleRule,
    onChangeFormat,
    onTogglePack,
    onToggleCustomPack,
    onCreateProfile,
    onDuplicateProfile,
    onRenameProfile,
    onDeleteProfile,
    onResetOverrides,
    onSaveProfile,
    onSavePack,
    onDuplicatePack,
    onDeletePack,
    onSetRemember,
    onResetDefaults,
    onClearPreferences,
    onNotice: showNotice,
  };

  return (
    <div className="app">
      <Header route={route} />
      <main className="workspace">
        {route.view === 'scan' && (
          <ScanView
            session={session}
            groups={groups}
            cleanText={cleanText}
            scanMeta={scanMeta}
            workspace={workspace}
            activeConfig={activeConfig}
            enabledCount={enabledIds.length}
            totalCount={detectors.length}
            onSource={setSource}
            onUpdateTerms={updateTerms}
            onScan={scan}
            onToggleGroup={onToggleGroup}
            onSelectProfile={onSelectProfile}
            onClear={clearAll}
            onNotice={showNotice}
          />
        )}
        {route.view === 'settings' && <SettingsView section={route.section} {...settingsProps} />}
        {route.view === 'about' && (
          <AboutView remember={workspace.remember} onClearPreferences={onClearPreferences} />
        )}
      </main>
      <div className="notice-region" role="status" aria-live="polite">
        {notice && <div className={`notice notice-${notice.kind}`}>{notice.text}</div>}
      </div>
      <footer className="footer">
        <span className="footer-dot" aria-hidden="true" />
        <span>Automated detection can miss sensitive information. Review before sharing.</span>
      </footer>
    </div>
  );
}
