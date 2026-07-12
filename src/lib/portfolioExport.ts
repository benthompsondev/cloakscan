import type { Finding } from './types';
import type { OutputMode } from './sanitize';
import type { ReadinessReport } from './readiness';

/**
 * Portfolio Export Kit: three small files a reviewer can hand over next to a
 * sanitized script. Everything here is aggregate-only by construction — the
 * summary and checklist builders receive counts, never findings, so no code
 * path exists for a matched value, source excerpt, candidate term, mapping,
 * or profile/list name to reach an exported file. The portfolio file itself
 * is the sanitized Portfolio-code output, nothing else.
 *
 * Generated on click, handed straight to the download path, never stored.
 */

export const PORTFOLIO_EXPORT_FILENAMES = {
  portfolio: 'cloakscan-portfolio.ps1',
  summary: 'cloakscan-findings-summary.txt',
  checklist: 'cloakscan-review-checklist.md',
} as const;

export type PortfolioExportFilename =
  (typeof PORTFOLIO_EXPORT_FILENAMES)[keyof typeof PORTFOLIO_EXPORT_FILENAMES];

/** Exact-match allowlist; anything else is not a CloakScan export name. */
export function isPortfolioExportFilename(name: string): name is PortfolioExportFilename {
  return Object.values(PORTFOLIO_EXPORT_FILENAMES).includes(name as PortfolioExportFilename);
}

/**
 * The only data the summary builder ever sees: counts and mode/version
 * strings. Building this is the single place findings are read.
 */
export interface ExportAggregates {
  findingCount: number;
  /** Distinct detectors that produced at least one finding. */
  detectorCount: number;
  /** Findings currently being replaced in the output. */
  replacementCount: number;
  /** Findings kept as-is (original value ships). Review leads excluded. */
  keptCount: number;
  reviewLeadCount: number;
  countsByCategory: Record<string, number>;
  countsBySeverity: Record<string, number>;
  readinessStatus: 'ready' | 'review';
  readinessWarnCount: number;
  readinessInfoCount: number;
}

export function buildExportAggregates(
  findings: readonly Finding[],
  readiness: ReadinessReport,
): ExportAggregates {
  const countsByCategory: Record<string, number> = {};
  const countsBySeverity: Record<string, number> = {};
  const detectorIds = new Set<string>();
  let replacementCount = 0;
  let keptCount = 0;
  let reviewLeadCount = 0;

  for (const f of findings) {
    detectorIds.add(f.detectorId);
    countsByCategory[f.category] = (countsByCategory[f.category] ?? 0) + 1;
    countsBySeverity[f.severity] = (countsBySeverity[f.severity] ?? 0) + 1;
    if (f.reviewLead === true) {
      reviewLeadCount += 1;
    } else if (f.enabled) {
      replacementCount += 1;
    } else {
      keptCount += 1;
    }
  }

  return {
    findingCount: findings.length,
    detectorCount: detectorIds.size,
    replacementCount,
    keptCount,
    reviewLeadCount,
    countsByCategory,
    countsBySeverity,
    readinessStatus: readiness.status,
    readinessWarnCount: readiness.items.filter((i) => i.tone === 'warn').length,
    readinessInfoCount: readiness.items.filter((i) => i.tone === 'info').length,
  };
}

const MODE_LABELS: Record<OutputMode, string> = {
  'safe-share': 'Safe-share (bracket placeholders)',
  'portfolio-code': 'Portfolio-code (generic identifiers where mapped)',
};

function countLines(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => `  ${key}: ${count}`);
}

/**
 * cloakscan-findings-summary.txt — aggregate numbers only. Takes the
 * aggregates object, deliberately not findings, so nothing value-shaped can
 * be interpolated here.
 */
export function buildFindingsSummary(input: {
  appVersion: string;
  outputMode: OutputMode;
  aggregates: ExportAggregates;
}): string {
  const { appVersion, outputMode, aggregates: a } = input;
  return [
    'CloakScan findings summary',
    '==========================',
    '',
    `App version: ${appVersion}`,
    `Output mode: ${MODE_LABELS[outputMode]}`,
    '',
    `Detectors that fired: ${a.detectorCount}`,
    `Findings: ${a.findingCount}`,
    `Replacements applied: ${a.replacementCount}`,
    `Findings kept as-is: ${a.keptCount}`,
    `Review leads flagged: ${a.reviewLeadCount}`,
    '',
    'Findings by category:',
    ...(countLines(a.countsByCategory).length > 0 ? countLines(a.countsByCategory) : ['  none']),
    '',
    'Findings by severity:',
    ...(countLines(a.countsBySeverity).length > 0 ? countLines(a.countsBySeverity) : ['  none']),
    '',
    `Readiness at export time: ${
      a.readinessStatus === 'ready' ? 'no open items' : 'items still open'
    } (${a.readinessWarnCount} warning${a.readinessWarnCount === 1 ? '' : 's'}, ${
      a.readinessInfoCount
    } informational)`,
    '',
    'This summary contains counts only — no source text, no matched values,',
    'and no configuration names. Automated detection can miss sensitive',
    'information. A person still needs to review the sanitized file before',
    'it is shared.',
    '',
  ].join('\n');
}

/**
 * cloakscan-review-checklist.md — a fixed, generic manual-review checklist.
 * Takes no scan input at all, so it cannot leak anything.
 */
export function buildReviewChecklist(): string {
  return [
    '# CloakScan manual review checklist',
    '',
    'Automated scanning is a first pass, not a guarantee. Work through this',
    'list against the sanitized file before sharing it anywhere public.',
    '',
    '## Names and organizations',
    '',
    '- [ ] No real organization, employer, or client names remain',
    '- [ ] No real person names, initials, or usernames remain',
    '- [ ] No team, department, or site names that identify the organization',
    '',
    '## Infrastructure',
    '',
    '- [ ] No real domains, hostnames, or server names',
    '- [ ] No internal URLs, IP addresses, or network paths',
    '- [ ] No real file paths that reveal usernames or internal structure',
    '',
    '## Code content',
    '',
    '- [ ] Comments and help blocks are free of names, tickets, and dates that identify the source',
    '- [ ] Identifiers (variables, functions, parameters) no longer name internal systems',
    '- [ ] Sample or test data is synthetic, not copied production data',
    '- [ ] No credentials, keys, tokens, or connection strings in any form',
    '',
    '## Final pass',
    '',
    '- [ ] The file still parses (for PowerShell: `[System.Management.Automation.Language.Parser]` or a dry run)',
    '- [ ] You read the whole file top to bottom one last time',
    '- [ ] Someone who knows the source context has seen it, if possible',
    '',
    '---',
    '',
    'Generated by CloakScan. This checklist is fixed text — it contains',
    'nothing from your scan.',
    '',
  ].join('\n');
}
