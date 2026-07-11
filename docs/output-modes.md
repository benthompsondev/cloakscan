# Output modes, Cloak List mappings, and review leads

CloakScan v1.3 added a second output mode aimed at one specific job: getting a
real PowerShell script ready for a public repo without turning it into broken
redaction soup. v1.4 builds the workflow around it — replacement strategies,
mapping suggestions, and a readiness summary. This page explains the two
modes, Cloak List mappings, and what a "review lead" is.

The output mode is independent of the detection profile: Balanced, Strict,
Maximum, and Code & secrets all work with either mode. It lives in the Scan
toolbar and in Settings → General, and switching never rescans.

## Safe-share mode (default)

Exactly the behavior CloakScan has always had. Every enabled finding becomes
a bracket placeholder — `[EMAIL_1]`, `[SECRET_1]`, `[UNC_PATH_1]`,
`[CUSTOM_TERM_1]` — and repeated values keep their number. Use it for
prompts, support tickets, logs, GitHub issues, and anything else where the
text just has to be safe, not runnable.

## Portfolio-code mode

Placeholders are the wrong tool inside code. If your org prefix appears in
identifiers, Safe-share produces things like:

```powershell
$[ORG_TERM_1]SystemID = 4          # not a variable any more
function Enable-[ORG_TERM_1]Account { }   # not a function any more
```

Portfolio-code mode fixes that for terms you map. A Cloak List **mapping**
pairs a term with a generic replacement identifier (`Nirv` →
`SourceSystem`). When the term is found in identifier position — inside a
variable, function, parameter, property, or Verb-Noun command name — the
replacement is spliced in instead of a placeholder, with casing adapted:

```powershell
$NirvSystemID = 4            ->  $SourceSystemID = 4        (with a NirvSystem mapping)
Enable-NIRVAccount           ->  Enable-SourceSystemAccount
$objUser.NirvAccess          ->  $objUser.SourceSystemAccess
$nirvId = 7                  ->  $sourceSystemId = 7
NIRV_EXPORT_DIR              ->  SOURCE_SYSTEM_EXPORT_DIR
```

Everything else keeps its bracket placeholder in both modes: string literal
contents, secrets, tokens, emails, URLs, hosts, ports, GUIDs, IPs, UNC and
file paths. Regex pattern strings (`-replace '[^a-zA-Z0-9]'` and friends)
are protected and never touched. Switching modes is instant and does not
rescan — replacements are computed during the scan.

Add the same term with more than one spelling when your code uses more than
one (`Nirv` and `NirvSystem` above): the longest match wins on overlap.

## Cloak List mappings

Each mapping entry has:

- **term** — the literal text to find (never a regex)
- **replacement** — a plain identifier (letters, numbers, underscores,
  hyphens), used only in Portfolio-code mode; leave it empty for a
  placeholder-only entry
- **category** — one of the suggested labels (Organization, Code Identifier,
  Access Group, Healthcare Identifier, ...), which controls how the finding
  is grouped
- **severity** — high / medium / low
- **match behavior** — case-insensitive (default, matches inside
  identifiers), exact case, or whole word
- **strategy** — what a match turns into (see below)

## Replacement strategies (v1.4)

Each mapping picks one of four strategies:

| Strategy | Safe-share mode | Portfolio-code mode |
| --- | --- | --- |
| **Code identifiers only** (default) | placeholder | replacement inside variable/function/property/command names; placeholder in prose and strings |
| **Genericize everywhere** | placeholder | replacement everywhere, including prose and string literals |
| **Placeholder** | placeholder | placeholder |
| **Review lead only** | flagged, nothing rewritten | flagged, nothing rewritten |

*Code identifiers only* is the old code-safe behavior and the right default
for org prefixes that live inside identifiers. *Genericize everywhere* is for
terms that should read naturally in comments and log messages too
(`# Nirv handoff` → `# SourceSystem handoff`). *Placeholder* is for terms
that should always be obviously redacted. *Review lead only* turns the
mapping into a pointer: matches show up in the findings list unchecked and
nothing changes until you enable them.

Lists exported by v1.3 import cleanly: entries with code-safe on and a
replacement become *Code identifiers only*, everything else becomes
*Placeholder*. v1.4 exports still carry the old code-safe flag so a v1.3
build can read them.

## The portfolio review flow (v1.4)

After a scan, three panels work together:

- **Sanitization readiness** — one summary of what still deserves a look:
  findings of any severity you kept as-is (the original value stays in the
  output), unreviewed review leads, suggested terms you have not dealt with,
  and invalid-code warnings. "No open items" means exactly that — it is
  guidance, not a guarantee.
- **Possible names & terms to review** — suggestions now sort org-specific
  terms first and tag well-known product phrases (Active Directory, Start
  Date) as *common term*. Each likely term shows a suggested generic
  replacement. Select the ones that matter and **Build Portfolio Cloak
  List** opens the editor pre-filled with ready-to-edit mappings; bulk
  hide/dismiss handle the rest.
- **Invalid-code warnings** — each warning links to the line in the preview,
  and a one-click switch to Portfolio-code mode is offered when that is the
  likely fix.

## Import and export

- **.txt** — plain terms, one per line. Good for quick lists.
- **.json** — the whole list: terms, mappings, matching options, label, and
  format. Use this to move a list between machines.

An exported file contains only the rules you wrote — never source text,
findings, matched scan values, filenames, clipboard content, or sanitized
output. The rules themselves are still organization-specific data: a list
named "employer terms" full of internal group names is sensitive on its own.
CloakScan warns before every JSON export; treat the file accordingly.

Imports are validated and fail safely — a malformed or foreign file is
rejected with a plain error, and whatever partially matches the expected
shape is cleaned through the same allowlists as stored preferences. An
imported list always starts session-only; saving its terms on the device
stays a separate opt-in.

## Review leads

v1.3 also ships detectors for the fingerprints that real IT automation
scripts leak: directory attribute names, Exchange workflow cmdlets,
credential handling commands, author initials in history blocks,
scheduled-job state files, and identity CSV headers. v1.4 adds script header
metadata — the value after `# Author:`, `# Company:`, `.AUTHOR`, and similar
labels in comment headers, which ties a script to real people and employers.

These are **review leads, not confirmed secrets**. The attribute name
`SamAccountName` is harmless; the value on that line often is not. So lead
findings start **unchecked**: they never rewrite your output (rewriting them
would usually corrupt the code), they just point at lines worth a second
look. Enable one if you decide it should be redacted after all. The findings
list groups them and can hide them with one toggle.

AD group names in membership commands (`Add-ADGroupMember -Identity "..."`)
are the exception: the quoted group name is a real organizational value, so
it is detected as a normal, enabled finding.

## Honest limits

- Detection is pattern-based. It misses things. Review before sharing —
  in both modes.
- Portfolio-code mode makes replacements *look* valid; it does not parse or
  execute PowerShell. The invalid-code panel flags the obvious breakage
  (`$[X]`, `function [X]`, `.[X]`), but a human read-through is still the
  last step.
- Case adaptation follows the matched text, not your style guide. Check the
  result reads the way you want.
