import type { SettingsSection } from '../../hooks/useHashRoute';
import type { CloakListSeed, Notice, Workspace } from '../../App';
import type { ProfileConfig } from '../../lib/profiles';
import type { CustomPack } from '../../lib/customPacks';
import type { RedactionChoice } from '../../lib/redaction';
import type { OutputMode } from '../../lib/sanitize';
import { GeneralSection } from './GeneralSection';
import { ProfilesPacksSection } from './ProfilesPacksSection';
import { RulesSection } from './RulesSection';
import { FormatsSection } from './FormatsSection';
import { PrivacySection } from './PrivacySection';

export interface SettingsProps {
  workspace: Workspace;
  activeConfig: ProfileConfig;
  resolvedStates: Record<string, boolean>;
  /** Session output mode — independent of the active profile. */
  outputMode: OutputMode;
  onSetOutputMode: (mode: OutputMode) => void;
  /** Pending "Build Portfolio Cloak List" seed from the Scan screen. */
  listSeed: CloakListSeed | null;
  onConsumeListSeed: () => void;
  /** Save a seeded list, enable it in the active configuration, and rescan. */
  onSaveAndUseList: (pack: CustomPack) => void;
  onSelectProfile: (id: string) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
  onChangeFormat: (format: RedactionChoice) => void;
  onTogglePack: (packId: string, on: boolean) => void;
  onToggleCustomPack: (packId: string, on: boolean) => void;
  onCreateProfile: (name: string) => void;
  onDuplicateProfile: (id: string) => void;
  onRenameProfile: (id: string, name: string) => void;
  onDeleteProfile: (id: string) => void;
  onResetOverrides: () => void;
  onSaveProfile: (profile: ProfileConfig) => void;
  onSavePack: (pack: CustomPack) => void;
  onDuplicatePack: (id: string) => void;
  onDeletePack: (id: string) => void;
  onSetRemember: (on: boolean) => void;
  onResetDefaults: () => void;
  onClearPreferences: () => void;
  onNotice: (notice: Notice) => void;
}

const SECTIONS: { id: SettingsSection; label: string; hint: string }[] = [
  { id: 'general', label: 'General', hint: 'Core modes & preferences' },
  { id: 'profiles', label: 'Profiles & Packs', hint: 'Regional & custom coverage' },
  { id: 'rules', label: 'Detection Rules', hint: 'What gets detected' },
  { id: 'formats', label: 'Redaction Formats', hint: 'Output placeholders' },
  { id: 'privacy', label: 'Privacy', hint: 'Data handling & storage' },
];

export function SettingsView({ section, ...props }: SettingsProps & { section: SettingsSection }) {
  return (
    <div className="settings">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-title muted">Configuration</div>
        <nav aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#/settings/${s.id}`}
              className={`settings-nav-link ${section === s.id ? 'is-active' : ''}`}
              aria-current={section === s.id ? 'page' : undefined}
            >
              <span className="settings-nav-label">{s.label}</span>
              <span className="muted settings-nav-hint">{s.hint}</span>
            </a>
          ))}
        </nav>
      </aside>
      <div className="settings-content">
        {section === 'general' && <GeneralSection {...props} />}
        {section === 'profiles' && <ProfilesPacksSection {...props} />}
        {section === 'rules' && <RulesSection {...props} />}
        {section === 'formats' && <FormatsSection {...props} />}
        {section === 'privacy' && <PrivacySection {...props} />}
      </div>
    </div>
  );
}
