import { describe, expect, it } from 'vitest';
import { personNameDetector, orgNameDetector } from './strict';
import { scanText } from '../scan';
import { buildCleanText } from '../sanitize';
import { enabledRuleIds, profileRuleStates } from '../profiles';

/**
 * Synthetic name/organization evaluation corpus (v0.7 assurance pass).
 *
 * Coverage comes from COMBINATIONS of synthetic values and realistic
 * contexts, not from any external dataset. Every value is fictional or
 * generic. This corpus lives only in tests — the runtime ships no name or
 * company dictionary of any kind.
 */

const strictIds = enabledRuleIds(profileRuleStates('strict'));

const personValues = (text: string) => personNameDetector.detect(text).map((m) => m.value);
const orgValues = (text: string) => orgNameDetector.detect(text).map((m) => m.value);

// ---------------------------------------------------------------- persons ---

/** Synthetic person names: accents, apostrophes (straight + curly), hyphens,
 *  particles, initials, and generational suffixes. */
const PERSON_NAMES = [
  'Alex Demo',
  'Bea Example',
  'Casey Rivera',
  'Rowan Ashford',
  'Morgan Vance',
  'Priya Raman',
  'Sofía Andrade',
  'Élodie Marchand',
  'Zoë Winters',
  'Dmitri Volkov',
  "Ciara O'Connor",
  'Nico D’Angelo',
  'Hans Müller',
  'Ana García-López',
  'Jean-Luc Picard',
  'Anna van der Berg',
  'Omar al Farouk',
  'Lars von Trier-Demo',
  'Mateus dos Santos',
  'Alex T. Demo',
  'Casey R.',
  'Morgan Vance Jr.',
  'Rowan Ashford Sr.',
  'Alex Demo II',
  'Bea Example III',
];

/** Explicit-label contexts. {v} is replaced with the name. */
const PERSON_LABEL_CONTEXTS = [
  'Name: {v}',
  'FullName = "{v}"',
  "DisplayName = '{v}'",
  '"name": "{v}"',
  '"requestedBy": "{v}"',
  'Owner: {v}',
  'Manager={v}',
  'Approver: "{v}"',
  '# Author: {v}',
  '@{ Contact = "{v}" }',
];

/** Prose-cue contexts (low confidence, still expected findings). */
const PERSON_PROSE_CONTEXTS = [
  'csv formatted as per {v} specifications',
  'AD group list pulled from {v} yesterday',
  'Lifted from {v}',
  'Contact {v}?',
  'Script prepared by {v} last week',
  'Change approved by {v} on Friday',
];

describe('person-name positive corpus', () => {
  const cases: { text: string; expected: string }[] = [];
  PERSON_NAMES.forEach((name, i) => {
    // Every name through two rotating label contexts…
    cases.push({
      text: PERSON_LABEL_CONTEXTS[i % PERSON_LABEL_CONTEXTS.length].replace('{v}', name),
      expected: name,
    });
    cases.push({
      text: PERSON_LABEL_CONTEXTS[(i + 3) % PERSON_LABEL_CONTEXTS.length].replace('{v}', name),
      expected: name,
    });
    // …and multi-part names through a rotating prose cue (prose cues
    // deliberately require at least two name parts).
    if (name.includes(' ')) {
      cases.push({
        text: PERSON_PROSE_CONTEXTS[i % PERSON_PROSE_CONTEXTS.length].replace('{v}', name),
        expected: name,
      });
    }
  });

  it(`covers at least 60 positive person cases (${cases.length} generated)`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(60);
  });

  for (const { text, expected } of cases) {
    it(`finds "${expected}" in: ${text}`, () => {
      expect(personValues(text)).toContain(expected);
    });
  }

  it('finds caseless-script names under explicit labels and CSV columns', () => {
    expect(personValues('Name: 田中太郎')).toEqual(['田中太郎']);
    expect(personValues('FullName = "أحمد فؤاد"')).toEqual(['أحمد فؤاد']);
    expect(personValues('FirstName,Status\n田中太郎,Active')).toEqual(['田中太郎']);
  });

  it('finds person cells in CSV with quotes, escaped quotes, empty cells, and CRLF', () => {
    const csv = [
      'FirstName,LastName,Notes',
      '"Alex","Demo","plain row"',
      'Casey,Rivera,',
      // An escaped quote elsewhere in the row must not break cell offsets.
      '"Ciara","O\'Connor","said ""ok"" and left"',
      ',,empty name cells stay empty',
    ].join('\r\n');
    const found = personValues(csv);
    expect(found).toContain('Alex');
    expect(found).toContain('Demo');
    expect(found).toContain('Casey');
    expect(found).toContain('Rivera');
    expect(found).toContain('Ciara');
    expect(found).toContain("O'Connor");
    expect(found).not.toContain('said ""ok"" and left');
  });

  it('CSV redaction preserves every structural byte around the cells', () => {
    const csv = 'FirstName,LastName,Status\r\n"Alex","Demo",Active\r\nCasey,Rivera,Paused\r\n';
    const findings = scanText(csv, { enabledDetectorIds: strictIds });
    const cleaned = buildCleanText(csv, findings);
    expect(cleaned).toBe(
      'FirstName,LastName,Status\r\n"[NAME_1]","[NAME_2]",Active\r\n[NAME_3],[NAME_4],Paused\r\n',
    );
  });

  it('repeated person values reuse one stable placeholder', () => {
    const text = 'Owner: Alex Demo\nManager: Alex Demo\n"name": "Alex Demo"';
    const findings = scanText(text, { enabledDetectorIds: strictIds });
    expect(new Set(findings.map((f) => f.placeholder)).size).toBe(1);
  });
});

// ------------------------------------------------------------ organizations ---

const ORG_NAMES = [
  'Northwind Regional Hospital',
  'Example Community Health',
  "St. Brigid's Healthcare Exampleville",
  'Fabrikam & Sons Ltd',
  'Trey Research Institute',
  'Wide World Importers Inc',
  'Lamna Healthcare Company',
  'Woodgrove Bank Corp',
  'Bellows College',
  'Alpine Ski School',
  'Proseware Solutions LLC',
  'Munson–Demo Foundation',
  "O'Hara Family Clinic",
  'Van Arsdel Group',
];

const ORG_LABEL_CONTEXTS = [
  'Company: {v}',
  'CompanyName = "{v}"',
  '"companyName": "{v}"',
  '"organization": "{v}"',
  'TenantName: {v}',
  "Employer = '{v}'",
  'Department: {v}',
  'Facility = "{v}"',
  'Vendor: {v}',
  'Client: "{v}"',
];

describe('organization positive corpus', () => {
  const cases: { text: string; expected: string }[] = [];
  ORG_NAMES.forEach((org, i) => {
    cases.push({
      text: ORG_LABEL_CONTEXTS[i % ORG_LABEL_CONTEXTS.length].replace('{v}', org),
      expected: org,
    });
    cases.push({
      text: ORG_LABEL_CONTEXTS[(i + 5) % ORG_LABEL_CONTEXTS.length].replace('{v}', org),
      expected: org,
    });
    cases.push({ text: `Copyright (c) 2024 ${org}`, expected: org });
  });

  it(`covers at least 40 positive organization cases (${cases.length} generated)`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });

  for (const { text, expected } of cases) {
    it(`finds "${expected}" in: ${text}`, () => {
      expect(orgValues(text)).toContain(expected);
    });
  }

  it('finds acronym and caseless organizations under explicit labels only', () => {
    expect(orgValues('Organization: NWRH')).toEqual(['NWRH']);
    expect(orgValues('Organization: 北風商事')).toEqual(['北風商事']);
    expect(orgValues('NWRH sent an update')).toEqual([]);
  });

  it('finds organization cells under recognized CSV headers', () => {
    const csv = 'Employee,Company,Department\nA. Demo,Fabrikam & Sons Ltd,Clinical Systems Demo\n';
    const found = orgValues(csv);
    expect(found).toContain('Fabrikam & Sons Ltd');
    expect(found).toContain('Clinical Systems Demo');
  });
});

// ---------------------------------------------------------------- negatives ---

/** Every line here must produce ZERO person-name and ZERO org-name findings. */
const NEGATIVE_CASES = [
  // PowerShell parameters and command syntax
  'Get-Process -Name "WindowsTerminal"',
  'Get-Service -Name "ExampleAgent"',
  'Select-Object -Property Name, Status',
  'Stop-Service -Name Spooler -Force',
  'Rename-Item -Path old.txt -NewName new.txt',
  'Sort-Object -Property LastName',
  'Import-Csv users.csv | Select FirstName',
  'Get-ChildItem | Where-Object Name -like "*.ps1"',
  'Invoke-Command -ComputerName srv-app01 -ScriptBlock { Get-Date }',
  'Test-Connection -TargetName 10.0.0.5 -Count 2',
  // Assignments to variables, cmdlets, and expressions
  'Name = $Variable',
  'Name = Get-Random',
  'Company = $Company',
  'DisplayName = $displayName',
  'FullName = [System.Environment]::UserName',
  'Owner = (Get-ADUser $id).DisplayName',
  '$name = Read-Host "Enter the server name"',
  // Service, product, file, host, constant shapes
  'ServiceName = "Print Spooler"',
  'Status = "Deployment Complete"',
  'Name: TRUE',
  'Name: NULL',
  'Name: ws-144.example.internal',
  'Hostname: server01',
  '$env:COMPUTERNAME',
  'INI section [name] stays untouched',
  'https://learn.example.com/module/name-basics',
  'Microsoft Windows Server 2022 Standard',
  'Visual Studio Code released an update',
  'Windows Terminal Preview build',
  'Restart the Print Spooler service after patching',
  // Ordinary capitalized prose without explicit context
  'Alex Morgan met Bea Demo for a review',
  'The Deployment Team approved the change window',
  'May, Rose, and Main are street names here',
  'The quick brown fox jumps over the lazy dog',
  'Deployment Complete: all systems normal',
  'Errors, warnings, and info messages are logged',
  // Prose cues followed by non-names
  'contact support for help',
  'Contact IT Help Desk',
  'Contact Microsoft Support',
  'as per the specifications document',
  'pulled from the main branch',
  'lifted from upstream sources',
  'created by automation at midnight',
  'Approved by CAB on Friday',
  'requested by management',
  'Prepared by PowerShell 7.4',
  'received from DHCP lease renewal',
  // Lowercase / empty / non-org labeled values
  'name: deployment failed',
  'company: internal use only',
  'company = $orgName',
  'Department: n/a',
  'Facility: TBD',
  'Organization: 12345',
  'Client: 4.2.1',
  // Copyright lines without a plausible holder
  'Copyright statement reviewed for accuracy',
  'copyright 2024',
  'Copyright (c) 2024 $CompanyVariable',
  // Comma-separated text that must NOT be treated as CSV
  'one, two, three\nfour, five, six',
  'Status,Count,Result\r\nActive,5,OK',
  'Get-Content servers.csv | Where-Object Name -eq $target',
  // Regex patterns and protected shapes
  "$TicketPattern = '^(INC|CHG|REQ)\\d{6}$'",
  'regex: ^[A-Z][a-z]+$',
  // Line boundaries
  'Owner:\nAlex Demo stays on its own line without a label',
  'Company:\nContoso Health on the next line is not a value',
];

describe('negative corpus: zero person/org findings', () => {
  it(`covers at least 60 negative cases (${NEGATIVE_CASES.length} listed)`, () => {
    expect(NEGATIVE_CASES.length).toBeGreaterThanOrEqual(60);
  });

  for (const text of NEGATIVE_CASES) {
    it(`stays silent on: ${text.split('\n')[0]}`, () => {
      expect(personValues(text)).toEqual([]);
      expect(orgValues(text)).toEqual([]);
    });
  }

  it('prose-only negatives survive the FULL strict engine byte-for-byte', () => {
    const proseOnly = [
      'Alex Morgan met Bea Demo for a review',
      'The Deployment Team approved the change window',
      'May, Rose, and Main are street names here',
      'The quick brown fox jumps over the lazy dog',
      'contact support for help',
      'as per the specifications document',
      'pulled from the main branch',
      'created by automation at midnight',
      'requested by management',
      'one, two, three\nfour, five, six',
      'Copyright statement reviewed for accuracy',
      'Errors, warnings, and info messages are logged',
    ];
    for (const text of proseOnly) {
      const findings = scanText(text, { enabledDetectorIds: strictIds });
      expect(buildCleanText(text, findings), text).toBe(text);
    }
  });
});

// -------------------------------------------------------------- performance ---

describe('name/org scanning performance', () => {
  it('scans a large mixed synthetic document without catastrophic matching', () => {
    const block = [
      'Owner: Alex Demo',
      'Get-Process -Name "WindowsTerminal" | Stop-Process',
      '"companyName": "Northwind Regional Hospital",',
      'FirstName,LastName,Department',
      'Alex,Demo,Example Clinical Systems',
      'The deployment finished without errors and the log was archived.',
      'Copyright (c) 2024 Trey Research Institute. All rights reserved.',
      'as per Casey Rivera specifications the export runs nightly',
      '"name": "not-a-person-value-127.0.0.1"',
      'x'.repeat(180),
    ].join('\n');
    const text = Array.from({ length: 400 }, () => block).join('\n'); // ~500 KB
    const t0 = performance.now();
    personNameDetector.detect(text);
    orgNameDetector.detect(text);
    const elapsed = performance.now() - t0;
    // Generous bound: catches catastrophic backtracking, not normal variance.
    expect(elapsed).toBeLessThan(5000);
  });
});
