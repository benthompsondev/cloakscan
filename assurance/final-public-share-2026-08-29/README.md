# Final public-share assurance campaign

This is the frozen outsider campaign used before the v1.5.5 public share. The
148 synthetic cases were written before reading CloakScan's detector source,
detector tests, detector documentation, or earlier campaign corpora.

## Frozen input

- Baseline: v1.5.4 at `e1eec1a36f612ae56ab39b8dc7dbe7a9dbe42b2c`
- Cases: 148 total, with 118 redaction cases and 30 preservation cases
- Corpus SHA-256: `214377131A7CB91D837A747EF1B77930EA29BC138A97D5915D4D340BF40C7F28`
- Committed corpus SHA-256: `AEE3754BDB75307EFFEB66510845CD53B01CFF3A7D79B163265D242C2870F2DF`
- Formats: config files, shells, code, logs, provider tokens, connection
  strings, cryptographic material, identifiers, multi-secret lines, benign
  controls, and provider near-misses

No runtime input, case, expectation, or count changed after the first execution.
One trailing blank line was removed before commit, and the synthetic Slack
webhook was assembled in parts so GitHub push protection would not treat it as
a live secret. Both the frozen and committed byte hashes are recorded above.

## Execution results

The first run used the deployed v1.5.4 Pages app and stable role, label, and
region locators. It produced 97 exact frozen-expectation passes and 51 raw
mismatches. Exact live reproductions separated real defects from safe but more
conservative product behavior.

After the focused fixes, the production UI run produced 116 exact passes and
32 raw mismatches. All 148 cases passed the material safety review. The 32 raw
mismatches contain no surviving secret fragment, crash, hang, or network
request. They are frozen expectation disagreements in three groups:

- Conservative whole-span redaction where the frozen case expected labels,
  schemes, paths, envelopes, or other safe syntax to remain: CFG-017, SH-005,
  SH-008, SH-009, SH-010, CODE-002, CODE-004, CODE-007, CODE-009, LOG-002,
  LOG-004, LOG-006, PROV-002, CONN-001, CONN-002, CONN-003, CONN-004,
  CONN-005, CONN-008, CRYPTO-001, CRYPTO-002, MULTI-002, and MULTI-003.
- Values outside the documented detector boundary: CFG-005, CRYPTO-003,
  CRYPTO-006, ID-006, and ID-008. These are an environment variable name, a
  public key, a generic digest, a system path with no user component, and an
  unlabeled account name.
- Conservative false positives with no secret leakage or surrounding-text
  corruption: SAFE-010, SAFE-013, SAFE-014, and SAFE-023.

## Material fixes

The campaign added focused regressions and narrow fixes for:

- YAML literal and folded credential blocks that left later body lines visible
- common CLI, SDK, and credential-pair forms
- Telegram bot URLs and adjacent GitHub-token/credential fields
- quoted and domain-qualified usernames in clear credential contexts
- labeled hosts, command targets, Azure identifiers, and labeled NTLM hashes
- temporary-password and authentication-error text
- common templates and obvious provider placeholders
- PowerShell static member calls being mistaken for secret assignments

Run the UI campaign against a local or deployed build with:

```powershell
$env:CLOAKSCAN_TARGET_URL = 'http://127.0.0.1:5173'
npx playwright test --config assurance/final-public-share-2026-08-29/playwright.config.mjs
```
