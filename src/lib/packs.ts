/**
 * Built-in policy pack registry. A pack is a reusable bundle of detector ids:
 * activating it enables those rules on top of the profile's Core mode.
 * Packs only ever ENABLE rules; per-rule overrides are applied after packs.
 *
 * Policy packs improve regional detection coverage. They do not guarantee
 * legal or regulatory compliance, and CloakGuard claims no certification.
 */

export interface PackDefinition {
  /** Stable id, referenced by profiles and persisted preferences. */
  id: string;
  name: string;
  region: string;
  version: number;
  description: string;
  /** Registry detector ids this pack enables. */
  detectorIds: readonly string[];
  limitations: string;
  /** Documentation / source references for the rule shapes. */
  references: readonly string[];
  builtIn: true;
}

export const BUILT_IN_PACKS: readonly PackDefinition[] = [
  {
    id: 'pack-ca-v1',
    name: 'Canada Pack',
    region: 'Canada',
    version: 1,
    description:
      'Canadian personal-data coverage: SIN (checksummed), postal codes, plus labeled phone, address, birth date, health identifiers, names, payment cards, and email.',
    detectorIds: [
      'canadian-sin',
      'ca-postal-code',
      'phone-number',
      'physical-address',
      'date-of-birth',
      'health-identifier',
      'payment-card',
      'email',
      'person-name',
      'org-name',
    ],
    limitations:
      'SIN validation follows the published checksum and issued ranges; postal codes require address-style context on the same line. Free-text names and addresses are never guessed.',
    references: [
      'Canada Post postal code structure (letter restrictions)',
      'Service Canada SIN validation (Luhn, leading-digit ranges)',
    ],
    builtIn: true,
  },
  {
    id: 'pack-us-v1',
    name: 'United States Pack',
    region: 'United States',
    version: 1,
    description:
      'US personal-data coverage: Social Security Numbers (issued ranges), ZIP and ZIP+4, plus labeled phone, address, birth date, health identifiers, names, payment cards, and email.',
    detectorIds: [
      'us-ssn',
      'us-zip',
      'phone-number',
      'physical-address',
      'date-of-birth',
      'health-identifier',
      'payment-card',
      'email',
      'person-name',
      'org-name',
    ],
    limitations:
      'SSNs are matched only when labeled or in the canonical dashed grouping and always checked against issued ranges — bare nine-digit numbers are never flagged. ZIP codes require address-style context.',
    references: [
      'SSA SSN randomization ranges (area/group/serial restrictions)',
      'USPS ZIP and ZIP+4 format',
    ],
    builtIn: true,
  },
  {
    id: 'pack-eu-v1',
    name: 'EU Common Pack',
    region: 'European Union',
    version: 1,
    description:
      'Shared EU coverage: IBAN account numbers (MOD-97 checksum, per-country lengths) plus labeled birth dates, names, addresses, payment cards, and email. Country-specific national-ID packs are future work, not part of this pack.',
    detectorIds: [
      'iban',
      'payment-card',
      'email',
      'date-of-birth',
      'person-name',
      'org-name',
      'physical-address',
    ],
    limitations:
      'IBANs must pass the ISO 13616 MOD-97 checksum and a known country length. National identity numbers (e.g. French INSEE, German IdNr) are deliberately not guessed in this shared pack.',
    references: ['ISO 13616 / SWIFT IBAN registry (country lengths, MOD-97)'],
    builtIn: true,
  },
];

export function packById(id: string): PackDefinition | undefined {
  return BUILT_IN_PACKS.find((p) => p.id === id);
}

/** Which built-in packs include a given detector (for rule badges). */
export function packsForDetector(detectorId: string): PackDefinition[] {
  return BUILT_IN_PACKS.filter((p) => p.detectorIds.includes(detectorId));
}

/** Shown wherever packs are presented. Wording is deliberate — never edit into a compliance claim. */
export const PACK_DISCLAIMER =
  'Policy packs improve regional detection coverage. They do not guarantee legal or regulatory compliance.';
