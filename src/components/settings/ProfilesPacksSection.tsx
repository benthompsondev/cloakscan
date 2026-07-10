import { useRef, useState } from 'react';
import { BUILT_IN_PACKS, PACK_DISCLAIMER, type PackDefinition } from '../../lib/packs';
import {
  BUILT_IN_PROFILES,
  enabledRuleIds,
  resolveRuleStates,
  MAX_PROFILES,
} from '../../lib/profiles';
import {
  MAX_CLOAK_LIST_IMPORT_BYTES,
  MAX_CUSTOM_PACKS,
  isCloakList,
  parseCloakListText,
  summarizeCloakListImport,
  type CustomPack,
} from '../../lib/customPacks';
import { parseCloakListFile, serializeCloakList } from '../../lib/cloakListFile';
import { decodeText } from '../../lib/decodeText';
import { downloadTextFile } from '../../lib/download';
import type { SettingsProps } from './SettingsView';
import { CustomPackEditor } from './CustomPackEditor';
import { CloakListEditor } from './CloakListEditor';
import { ProfileEditor } from './ProfileEditor';

export function ProfilesPacksSection(props: SettingsProps) {
  const { workspace, activeConfig } = props;
  const importListInput = useRef<HTMLInputElement>(null);
  const importJsonInput = useRef<HTMLInputElement>(null);
  const [confirmExportId, setConfirmExportId] = useState<string | null>(null);
  const [editingPack, setEditingPack] = useState<CustomPack | 'new' | null>(null);
  const [editingList, setEditingList] = useState<CustomPack | 'new' | null>(null);
  const [newListFromFile, setNewListFromFile] = useState<{ name: string; termsText: string } | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [detailsPackId, setDetailsPackId] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const effectiveCount = enabledRuleIds(
    resolveRuleStates(activeConfig, workspace.customPacks),
  ).length;

  const cloakLists = workspace.customPacks.filter(isCloakList);
  const advancedPacks = workspace.customPacks.filter((p) => !isCloakList(p));

  const filenameStem = (name: string) =>
    name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'cloak-list';

  const exportList = async (list: CustomPack) => {
    const result = await downloadTextFile(
      `${filenameStem(list.name)}-cloak-list.txt`,
      list.terms.values.join('\n'),
    );
    props.onNotice({
      kind: result === 'cancelled' ? 'err' : 'ok',
      text:
        result === 'cancelled'
          ? 'Cloak List export cancelled.'
          : `Exported "${list.name}" as a .txt list.`,
    });
  };

  const exportListJson = async (list: CustomPack) => {
    setConfirmExportId(null);
    const result = await downloadTextFile(
      `${filenameStem(list.name)}-cloak-list.json`,
      serializeCloakList(list),
    );
    props.onNotice({
      kind: result === 'cancelled' ? 'err' : 'ok',
      text:
        result === 'cancelled'
          ? 'Cloak List export cancelled.'
          : `Exported "${list.name}" with its mappings as JSON.`,
    });
  };

  const importListJsonFile = async (file: File) => {
    if (file.size > MAX_CLOAK_LIST_IMPORT_BYTES) {
      props.onNotice({ kind: 'err', text: 'That file is too large. Import a .json file under 256 KB.' });
      return;
    }
    try {
      const decoded = decodeText(new Uint8Array(await file.arrayBuffer()));
      if (decoded === null) {
        props.onNotice({ kind: 'err', text: 'Could not decode that file.' });
        return;
      }
      const result = parseCloakListFile(decoded);
      if (!result.ok) {
        props.onNotice({ kind: 'err', text: result.error });
        return;
      }
      props.onSavePack(result.pack);
      props.onNotice({
        kind: 'ok',
        text: `Imported Cloak List "${result.pack.name}" — session-only until you opt into saving its terms.`,
      });
    } catch {
      props.onNotice({ kind: 'err', text: 'Could not read that file.' });
    }
  };

  const importListFile = async (file: File) => {
    if (!file.name.toLocaleLowerCase().endsWith('.txt')) {
      props.onNotice({ kind: 'err', text: 'Import a plain .txt file with one term per line.' });
      return;
    }
    if (file.size > MAX_CLOAK_LIST_IMPORT_BYTES) {
      props.onNotice({ kind: 'err', text: 'That list is too large. Import a .txt file under 256 KB.' });
      return;
    }
    try {
      const decoded = decodeText(new Uint8Array(await file.arrayBuffer()));
      if (decoded === null) {
        props.onNotice({ kind: 'err', text: 'Could not decode that .txt file.' });
        return;
      }
      const parsed = parseCloakListText(decoded);
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 40) || 'Imported list';
      setNewListFromFile({ name, termsText: parsed.terms.join('\n') });
      setEditingList('new');
      props.onNotice({ kind: 'ok', text: summarizeCloakListImport(parsed) });
    } catch {
      props.onNotice({ kind: 'err', text: 'Could not read that .txt file.' });
    }
  };

  // Only saved named profiles can be edited — built-in presets never appear
  // in workspace.profiles, so they can never reach the editor.
  const editingProfile = workspace.profiles.find((p) => p.id === editingProfileId) ?? null;
  if (editingProfile !== null) {
    return (
      <ProfileEditor
        profile={editingProfile}
        customPacks={workspace.customPacks}
        remember={workspace.remember}
        onSavePack={props.onSavePack}
        onSave={(profile) => {
          props.onSaveProfile(profile);
          setEditingProfileId(null);
        }}
        onCancel={() => setEditingProfileId(null)}
      />
    );
  }

  if (editingList !== null) {
    return (
      <CloakListEditor
        list={editingList === 'new' ? null : editingList}
        remember={workspace.remember}
        initialName={editingList === 'new' ? newListFromFile?.name : undefined}
        initialTermsText={editingList === 'new' ? newListFromFile?.termsText : undefined}
        onSave={(pack) => {
          props.onSavePack(pack);
          setNewListFromFile(null);
          setEditingList(null);
        }}
        onCancel={() => {
          setNewListFromFile(null);
          setEditingList(null);
        }}
      />
    );
  }

  if (editingPack !== null) {
    return (
      <CustomPackEditor
        pack={editingPack === 'new' ? null : editingPack}
        remember={workspace.remember}
        onSave={(pack) => {
          props.onSavePack(pack);
          setEditingPack(null);
        }}
        onCancel={() => setEditingPack(null)}
      />
    );
  }

  return (
    <section className="panel settings-panel" aria-label="Profiles and packs">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Profiles & Packs</h2>
          <span className="muted">
            Active: {activeConfig.name} · {effectiveCount} effective rules
          </span>
        </div>
      </div>
      <div className="settings-body">
        <p className="muted pack-disclaimer">{PACK_DISCLAIMER}</p>

        {/* ---------------- Profiles ---------------- */}
        <h3>Profiles</h3>
        <ul className="profile-rows" aria-label="Profiles">
          {[
            ...BUILT_IN_PROFILES,
            ...workspace.profiles,
            ...(workspace.activeProfileId === 'unsaved' && workspace.unsaved
              ? [{ id: 'unsaved', name: 'Unsaved configuration', builtIn: false }]
              : []),
          ].map((p) => {
            const isActive = workspace.activeProfileId === p.id;
            const named = workspace.profiles.some((x) => x.id === p.id);
            return (
              <li key={p.id} className={`profile-row ${isActive ? 'is-active' : ''}`}>
                <button
                  type="button"
                  className="profile-row-select"
                  aria-pressed={isActive}
                  onClick={() => props.onSelectProfile(p.id)}
                >
                  <strong>{p.name}</strong>
                  {p.builtIn ? (
                    <span className="chip">Built-in</span>
                  ) : p.id === 'unsaved' ? (
                    <span className="chip chip-warn">Session-only</span>
                  ) : (
                    <span className="chip">{workspace.remember ? 'Saved' : 'Session-only'}</span>
                  )}
                  {isActive && <span className="chip chip-strict">Active</span>}
                </button>
                {named && renamingId === p.id ? (
                  <span className="profile-row-actions">
                    <input
                      className="rule-search"
                      value={renameValue}
                      maxLength={40}
                      aria-label={`New name for ${p.name}`}
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => {
                        props.onRenameProfile(p.id, renameValue);
                        setRenamingId(null);
                      }}
                    >
                      Save
                    </button>
                    <button type="button" className="btn btn-mini" onClick={() => setRenamingId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : named ? (
                  <span className="profile-row-actions">
                    <button
                      type="button"
                      className="btn btn-mini"
                      aria-label={`Edit profile ${p.name}`}
                      onClick={() => setEditingProfileId(p.id)}
                    >
                      Edit profile
                    </button>
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                      }}
                    >
                      Rename
                    </button>
                    <button type="button" className="btn btn-mini" onClick={() => props.onDuplicateProfile(p.id)}>
                      Duplicate
                    </button>
                    {confirmDeleteId === p.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-mini btn-danger"
                          onClick={() => {
                            props.onDeleteProfile(p.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Confirm delete
                        </button>
                        <button type="button" className="btn btn-mini" onClick={() => setConfirmDeleteId(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-mini" onClick={() => setConfirmDeleteId(p.id)}>
                        Delete
                      </button>
                    )}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="setting-row">
          <input
            className="rule-search"
            placeholder="New profile name…"
            aria-label="New profile name"
            value={newProfileName}
            maxLength={40}
            onChange={(e) => setNewProfileName(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={newProfileName.trim().length === 0 || workspace.profiles.length >= MAX_PROFILES}
            onClick={() => {
              props.onCreateProfile(newProfileName);
              setNewProfileName('');
            }}
          >
            Create profile from current configuration
          </button>
        </div>
        <p className="muted">
          A profile combines a Core mode (Balanced or Strict), selected packs, rule overrides, and
          a redaction format. Use <strong>Edit profile</strong> on a named profile to change its
          name, mode, packs, rules, and format in one place — nothing applies until you save.
          Built-in presets are read-only — changing anything while one is active creates an
          unsaved configuration.{' '}
          {Object.keys(activeConfig.overrides).length > 0 && (
            <button type="button" className="btn btn-mini" onClick={props.onResetOverrides}>
              Reset {Object.keys(activeConfig.overrides).length} rule override
              {Object.keys(activeConfig.overrides).length === 1 ? '' : 's'}
            </button>
          )}
        </p>

        {/* ---------------- Cloak Lists ---------------- */}
        <h3>Cloak Lists</h3>
        <p className="muted">
          Reusable collections of exact words or phrases — organization names, domains, hostnames,
          usernames, project names, team names. For the current session only, use{' '}
          <strong>Hide custom terms</strong> on the Scan screen (never saved).
        </p>
        <div className="pack-grid">
          {cloakLists.map((list) => (
            <div className="pack-card" key={list.id}>
              <div className="pack-card-head">
                <strong>{list.name}</strong>
                <span className="chip">Cloak List</span>
                <span className="chip">
                  {workspace.remember
                    ? list.terms.saveTerms
                      ? 'Saved'
                      : 'List saved · terms session-only'
                    : 'Session-only'}
                </span>
              </div>
              <p className="muted pack-card-desc">{list.description || 'Exact terms to cloak.'}</p>
              <p className="muted pack-card-meta">
                {list.terms.values.length} term{list.terms.values.length === 1 ? '' : 's'}
                {(list.terms.mappings?.length ?? 0) > 0
                  ? ` · ${list.terms.mappings?.length} mapping${list.terms.mappings?.length === 1 ? '' : 's'}`
                  : ''}{' '}
                · {list.terms.matchInsideWords ? 'matches inside words' : 'exact words/phrases'}
                {list.terms.caseSensitive ? ' · case-sensitive' : ''}
              </p>
              <div className="pack-card-actions">
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={activeConfig.customPackIds.includes(list.id)}
                    onChange={(e) => props.onToggleCustomPack(list.id, e.target.checked)}
                    aria-label={`Enable Cloak List ${list.name} in the active profile`}
                  />
                  <span className="switch-track" aria-hidden="true" />
                </label>
                <button type="button" className="btn btn-mini" onClick={() => setEditingList(list)}>
                  Edit
                </button>
                <button type="button" className="btn btn-mini" onClick={() => props.onDuplicatePack(list.id)}>
                  Duplicate
                </button>
                <button type="button" className="btn btn-mini" onClick={() => void exportList(list)}>
                  Export .txt
                </button>
                {confirmExportId === list.id ? (
                  <>
                    <span className="muted export-warning">
                      This file will contain your organization-specific terms — treat it as
                      sensitive.
                    </span>
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => void exportListJson(list)}
                    >
                      Export anyway
                    </button>
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => setConfirmExportId(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-mini"
                    onClick={() => setConfirmExportId(list.id)}
                  >
                    Export JSON
                  </button>
                )}
                {confirmDeleteId === list.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-mini btn-danger"
                      onClick={() => {
                        props.onDeletePack(list.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Confirm delete
                    </button>
                    <button type="button" className="btn btn-mini" onClick={() => setConfirmDeleteId(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-mini" onClick={() => setConfirmDeleteId(list.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="setting-row">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={workspace.customPacks.length >= MAX_CUSTOM_PACKS}
            onClick={() => {
              setNewListFromFile(null);
              setEditingList('new');
            }}
          >
            Create Cloak List
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={workspace.customPacks.length >= MAX_CUSTOM_PACKS}
            onClick={() => importListInput.current?.click()}
          >
            Import Cloak List (.txt)
          </button>
          <input
            ref={importListInput}
            type="file"
            accept=".txt,text/plain"
            className="visually-hidden"
            aria-label="Import Cloak List from .txt"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importListFile(file);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={workspace.customPacks.length >= MAX_CUSTOM_PACKS}
            onClick={() => importJsonInput.current?.click()}
          >
            Import Cloak List (.json)
          </button>
          <input
            ref={importJsonInput}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            aria-label="Import Cloak List from JSON"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importListJsonFile(file);
              event.target.value = '';
            }}
          />
          <p className="muted">
            Name it, add exact terms and mappings, choose matching options, and (optionally)
            save the term values on this device. JSON export carries mappings; .txt carries
            terms only.
          </p>
        </div>

        {/* ---------------- Packs ---------------- */}
        <h3>Packs</h3>
        <div className="pack-grid">
          {BUILT_IN_PACKS.map((pack) => (
            <BuiltInPackCard
              key={pack.id}
              pack={pack}
              enabled={activeConfig.packIds.includes(pack.id)}
              detailsOpen={detailsPackId === pack.id}
              onToggle={(on) => props.onTogglePack(pack.id, on)}
              onDetails={() => setDetailsPackId(detailsPackId === pack.id ? null : pack.id)}
            />
          ))}
          {advancedPacks.map((pack) => (
            <div className="pack-card" key={pack.id}>
              <div className="pack-card-head">
                <strong>{pack.name}</strong>
                <span className="chip">Custom</span>
                <span className="chip">{workspace.remember ? 'Saved' : 'Session-only'}</span>
              </div>
              <p className="muted pack-card-desc">
                {pack.description || 'Custom detection bundle.'}
              </p>
              <p className="muted pack-card-meta">
                {pack.detectorIds.length + pack.rules.length} rule
                {pack.detectorIds.length + pack.rules.length === 1 ? '' : 's'} ·{' '}
                {pack.terms.values.length} cloak term{pack.terms.values.length === 1 ? '' : 's'}
              </p>
              <div className="pack-card-actions">
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={activeConfig.customPackIds.includes(pack.id)}
                    onChange={(e) => props.onToggleCustomPack(pack.id, e.target.checked)}
                    aria-label={`Enable pack ${pack.name} in the active profile`}
                  />
                  <span className="switch-track" aria-hidden="true" />
                </label>
                <button type="button" className="btn btn-mini" onClick={() => setEditingPack(pack)}>
                  Edit
                </button>
                <button type="button" className="btn btn-mini" onClick={() => props.onDuplicatePack(pack.id)}>
                  Duplicate
                </button>
                {confirmDeleteId === pack.id ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-mini btn-danger"
                      onClick={() => {
                        props.onDeletePack(pack.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Confirm delete
                    </button>
                    <button type="button" className="btn btn-mini" onClick={() => setConfirmDeleteId(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-mini" onClick={() => setConfirmDeleteId(pack.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="setting-row">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={workspace.customPacks.length >= MAX_CUSTOM_PACKS}
            onClick={() => setEditingPack('new')}
          >
            Create Custom Pack
          </button>
          <p className="muted">
            Advanced: bundle registry rules, safe labeled-field rules, and an optional term set.
            For terms only, a Cloak List is simpler.
          </p>
        </div>
      </div>
    </section>
  );
}

function BuiltInPackCard({
  pack,
  enabled,
  detailsOpen,
  onToggle,
  onDetails,
}: {
  pack: PackDefinition;
  enabled: boolean;
  detailsOpen: boolean;
  onToggle: (on: boolean) => void;
  onDetails: () => void;
}) {
  return (
    <div className={`pack-card ${enabled ? 'is-enabled' : ''}`}>
      <div className="pack-card-head">
        <strong>{pack.name}</strong>
        <span className="chip">Built-in</span>
        <span className="chip chip-cat-infrastructure">{pack.region}</span>
        <span className="muted">v{pack.version}</span>
      </div>
      <p className="muted pack-card-desc">{pack.description}</p>
      <p className="muted pack-card-meta">{pack.detectorIds.length} rules included</p>
      <div className="pack-card-actions">
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={`Enable pack ${pack.name} in the active profile`}
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
        <button type="button" className="btn btn-mini" aria-expanded={detailsOpen} onClick={onDetails}>
          {detailsOpen ? 'Hide details' : 'Details'}
        </button>
      </div>
      {detailsOpen && (
        <div className="pack-details">
          <h4>Limitations</h4>
          <p className="muted">{pack.limitations}</p>
          <h4>References</h4>
          <ul className="muted pack-refs">
            {pack.references.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
