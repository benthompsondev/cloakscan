import {
  BALANCED_PROFILE,
  BUILT_IN_PROFILES,
  enabledRuleIds,
  resolveRuleStates,
  type ProfileConfig,
} from './profiles';
import type { CustomPack } from './customPacks';

/**
 * Workspace: everything configurable that is not scan-session content.
 * Lives in React state in App; these helpers are the pure state-transition
 * layer so "save this list and rescan with it" can be computed in one step
 * and the rescan can use the RESULT directly — never React state that may
 * not have re-rendered yet.
 */
export interface Workspace {
  remember: boolean;
  /** A built-in id, 'unsaved', or a named profile id. */
  activeProfileId: string;
  /** Session-only configuration created by modifying a built-in preset. */
  unsaved: ProfileConfig | null;
  profiles: ProfileConfig[];
  customPacks: CustomPack[];
}

export function cloneConfig(config: ProfileConfig): ProfileConfig {
  return {
    ...config,
    packIds: [...config.packIds],
    customPackIds: [...config.customPackIds],
    overrides: { ...config.overrides },
    format: { ...config.format },
  };
}

/** Resolve the active configuration of a workspace (pure App.activeConfig). */
export function activeConfigOf(workspace: Workspace): ProfileConfig {
  const builtIn = BUILT_IN_PROFILES.find((p) => p.id === workspace.activeProfileId);
  if (builtIn) return builtIn;
  if (workspace.activeProfileId === 'unsaved' && workspace.unsaved) return workspace.unsaved;
  return workspace.profiles.find((p) => p.id === workspace.activeProfileId) ?? BALANCED_PROFILE;
}

/**
 * Everything the caller needs to apply a saved Cloak List and rescan with it
 * in the same event, without waiting for React state to settle.
 */
export interface ApplyListResult {
  workspace: Workspace;
  /** The exact configuration the next scan must use. */
  activeConfig: ProfileConfig;
  /** The exact custom packs the next scan must use. */
  customPacks: CustomPack[];
  /** Detector ids enabled under the next configuration. */
  enabledDetectorIds: string[];
}

/**
 * Save a Cloak List and enable it in the active configuration, in one pure
 * step. Profile rules:
 *
 * - Built-in active: fork it into the session-only Unsaved configuration and
 *   enable the list there. Built-in presets are never mutated.
 * - Unsaved configuration active: update that configuration.
 * - Named profile active: update only that profile; every other profile is
 *   left untouched.
 *
 * The list id is added to customPackIds at most once. `remember` and every
 * persistence option are carried through unchanged — nothing here flips an
 * opt-in. Inputs are never mutated.
 */
export function applyCloakListToWorkspace(
  workspace: Workspace,
  list: CustomPack,
): ApplyListResult {
  const exists = workspace.customPacks.some((p) => p.id === list.id);
  const customPacks = exists
    ? workspace.customPacks.map((p) => (p.id === list.id ? list : p))
    : [...workspace.customPacks, list];

  const current = activeConfigOf(workspace);
  const next = cloneConfig(current);
  if (!next.customPackIds.includes(list.id)) {
    next.customPackIds = [...next.customPackIds, list.id];
  }

  let nextWorkspace: Workspace;
  if (current.builtIn) {
    next.id = 'unsaved';
    next.name = 'Unsaved configuration';
    next.builtIn = undefined;
    nextWorkspace = {
      ...workspace,
      customPacks,
      activeProfileId: 'unsaved',
      unsaved: next,
    };
  } else if (workspace.activeProfileId === 'unsaved') {
    nextWorkspace = { ...workspace, customPacks, unsaved: next };
  } else {
    nextWorkspace = {
      ...workspace,
      customPacks,
      profiles: workspace.profiles.map((p) => (p.id === next.id ? next : p)),
    };
  }

  return {
    workspace: nextWorkspace,
    activeConfig: next,
    customPacks,
    enabledDetectorIds: enabledRuleIds(resolveRuleStates(next, customPacks)),
  };
}
