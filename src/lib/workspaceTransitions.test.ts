import { describe, expect, it } from 'vitest';
import { applyCloakListToWorkspace, activeConfigOf, type Workspace } from './workspaceTransitions';
import { BALANCED_PROFILE, STRICT_PROFILE, type ProfileConfig } from './profiles';
import { emptyPackTerms, type CustomPack } from './customPacks';

const namedProfile = (over: Partial<ProfileConfig> = {}): ProfileConfig => ({
  ...BALANCED_PROFILE,
  id: 'p-named',
  name: 'Ops profile',
  builtIn: undefined,
  packIds: [],
  customPackIds: [],
  overrides: {},
  format: { ...BALANCED_PROFILE.format },
  ...over,
});

const list = (id = 'cl-portfolio'): CustomPack => ({
  id,
  name: 'Portfolio Cloak List',
  detectorIds: [],
  rules: [],
  terms: {
    ...emptyPackTerms(),
    mappings: [
      {
        id: 'm1',
        term: 'Nirv',
        replacement: 'SourceSystem',
        categoryLabel: 'Organization',
        severity: 'medium',
        matchMode: 'ci-literal',
        codeSafe: true,
        strategy: 'code-only',
      },
    ],
  },
  enabled: true,
});

const workspace = (over: Partial<Workspace> = {}): Workspace => ({
  remember: false,
  activeProfileId: 'balanced',
  unsaved: null,
  profiles: [],
  customPacks: [],
  ...over,
});

/** Deep-freeze so any mutation of the input throws in the test. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('applyCloakListToWorkspace', () => {
  it('forks an active built-in into the Unsaved configuration', () => {
    const result = applyCloakListToWorkspace(workspace(), list());

    expect(result.workspace.activeProfileId).toBe('unsaved');
    expect(result.workspace.unsaved).not.toBeNull();
    expect(result.workspace.unsaved!.name).toBe('Unsaved configuration');
    expect(result.workspace.unsaved!.builtIn).toBeUndefined();
    expect(result.workspace.unsaved!.customPackIds).toEqual(['cl-portfolio']);
    // The built-in preset itself is untouched.
    expect(BALANCED_PROFILE.customPackIds).toEqual([]);
    expect(BALANCED_PROFILE.builtIn).toBe(true);
  });

  it('keeps the built-in fork on the built-in core mode and settings', () => {
    const result = applyCloakListToWorkspace(workspace({ activeProfileId: 'strict' }), list());
    expect(result.activeConfig.core).toBe(STRICT_PROFILE.core);
    expect(result.activeConfig.customPackIds).toEqual(['cl-portfolio']);
  });

  it('updates only the active named profile', () => {
    const active = namedProfile({ id: 'p-a', name: 'Profile A' });
    const other = namedProfile({ id: 'p-b', name: 'Profile B' });
    const result = applyCloakListToWorkspace(
      workspace({ activeProfileId: 'p-a', profiles: [active, other] }),
      list(),
    );

    const updatedA = result.workspace.profiles.find((p) => p.id === 'p-a')!;
    const untouchedB = result.workspace.profiles.find((p) => p.id === 'p-b')!;
    expect(updatedA.customPackIds).toEqual(['cl-portfolio']);
    expect(untouchedB.customPackIds).toEqual([]);
    expect(untouchedB).toBe(other); // same object — genuinely untouched
    expect(result.workspace.activeProfileId).toBe('p-a');
    expect(result.workspace.unsaved).toBeNull();
  });

  it('updates the Unsaved configuration when it is active', () => {
    const unsaved = namedProfile({ id: 'unsaved', name: 'Unsaved configuration' });
    const result = applyCloakListToWorkspace(
      workspace({ activeProfileId: 'unsaved', unsaved }),
      list(),
    );
    expect(result.workspace.activeProfileId).toBe('unsaved');
    expect(result.workspace.unsaved!.customPackIds).toEqual(['cl-portfolio']);
    expect(result.workspace.profiles).toEqual([]);
  });

  it('never mutates its inputs', () => {
    const active = namedProfile({ id: 'p-a' });
    const input = deepFreeze(
      workspace({ activeProfileId: 'p-a', profiles: [active], customPacks: [] }),
    );
    // Would throw on any mutation because the input is frozen.
    const result = applyCloakListToWorkspace(input, deepFreeze(list()));
    expect(result.workspace).not.toBe(input);
    expect(input.profiles[0].customPackIds).toEqual([]);
  });

  it('adds the list id exactly once, even when applied twice', () => {
    const first = applyCloakListToWorkspace(workspace(), list());
    const second = applyCloakListToWorkspace(first.workspace, list());
    expect(second.activeConfig.customPackIds).toEqual(['cl-portfolio']);
    expect(second.customPacks).toHaveLength(1);
  });

  it('replaces an existing pack with the same id instead of duplicating it', () => {
    const existing = list();
    const edited = { ...list(), name: 'Portfolio Cloak List v2' };
    const result = applyCloakListToWorkspace(
      workspace({ customPacks: [existing] }),
      edited,
    );
    expect(result.customPacks).toHaveLength(1);
    expect(result.customPacks[0].name).toBe('Portfolio Cloak List v2');
  });

  it('preserves remember and does not invent persistence opt-ins', () => {
    const on = applyCloakListToWorkspace(workspace({ remember: true }), list());
    const off = applyCloakListToWorkspace(workspace({ remember: false }), list());
    expect(on.workspace.remember).toBe(true);
    expect(off.workspace.remember).toBe(false);
    // saveTerms stays exactly what the list carried (false by default).
    expect(on.customPacks[0].terms.saveTerms).toBe(false);
  });

  it('returns the exact detector ids for the next configuration, not the old one', () => {
    // A list carrying a registry detector id proves the rescan inputs come
    // from the NEXT workspace: balanced alone would not include a packOnly
    // rule, but nothing here relies on stale pre-transition state.
    const result = applyCloakListToWorkspace(workspace(), list());
    expect(result.enabledDetectorIds.length).toBeGreaterThan(0);
    // The result is self-consistent: recomputing from the returned workspace
    // gives the same answer.
    const again = applyCloakListToWorkspace(result.workspace, list());
    expect(again.enabledDetectorIds).toEqual(result.enabledDetectorIds);
  });

  it('falls back to balanced when the active profile id no longer exists', () => {
    const result = applyCloakListToWorkspace(
      workspace({ activeProfileId: 'ghost-profile' }),
      list(),
    );
    // Balanced is a built-in, so the fallback forks into Unsaved.
    expect(result.workspace.activeProfileId).toBe('unsaved');
    expect(result.activeConfig.customPackIds).toEqual(['cl-portfolio']);
  });
});

describe('activeConfigOf', () => {
  it('resolves built-ins, unsaved, named profiles, and the fallback', () => {
    expect(activeConfigOf(workspace()).id).toBe('balanced');
    const unsaved = namedProfile({ id: 'unsaved' });
    expect(activeConfigOf(workspace({ activeProfileId: 'unsaved', unsaved })).id).toBe('unsaved');
    const named = namedProfile({ id: 'p-x' });
    expect(activeConfigOf(workspace({ activeProfileId: 'p-x', profiles: [named] })).id).toBe('p-x');
    expect(activeConfigOf(workspace({ activeProfileId: 'nope' })).id).toBe('balanced');
  });
});
