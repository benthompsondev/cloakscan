// Type surface for scripts/update-manifest.mjs so the vitest suite can
// import and exercise it under the strict TypeScript build.

export interface PlatformEntry {
  signature: string;
  url: string;
}

export interface UpdateManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, PlatformEntry>;
}

export declare const REQUIRED_PLATFORMS: string[];

export declare function validateEntry(platform: string, entry: unknown): void;
export declare function validateManifest(manifest: unknown): UpdateManifest;
export declare function buildManifest(input: {
  version: string;
  notes?: string;
  pubDate: string;
  platforms: Record<string, PlatformEntry>;
}): UpdateManifest;
export declare function mergeManifest(
  existing: unknown,
  additions: Record<string, PlatformEntry>,
): UpdateManifest;
export declare function renderManifest(manifest: UpdateManifest): string;
