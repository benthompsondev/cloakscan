# CloakGuard stress-test files

These files contain synthetic data only. They are meant for manual testing and detector regression checks.

## Suggested test order

1. Start with the **Balanced** profile.
2. Import one file and scan it.
3. Confirm secrets, email addresses and suffixes, network details, and absolute paths are replaced.
4. Switch to **Strict** and scan again.
5. Confirm labeled names, organizations, phone numbers, addresses, birth dates, and health identifiers are also replaced.
6. Review the output for partial leftovers, especially text after a path containing spaces and domains that were assembled from a variable plus `@example.org`.

For `sharing-draft-and-custom-terms.md`, also add this temporary Cloak List or use **Hide custom terms**:

```text
Northwind Regional Health
Project Firefly
O'Brien Demo Team
example-health.org
```

The file includes punctuation variants such as `O’Brien Demo Team` and `O'Brien Demo Team`. Both should use the same custom placeholder.

## names-and-organizations.txt

The fifth file focuses on person and organization detection across PowerShell metadata, JSON exports, CSV files, support logs, and prose. With the **Strict** profile:

- labeled fields, quoted JSON keys, recognized CSV columns, author/contact bylines, prose cues ("prepared by", "as per", "pulled from", "lifted from", "Contact …"), and copyright lines should all be replaced;
- command syntax (`Get-Process -Name "WindowsTerminal"`, `Name = Get-Random`), CSV files without person/organization columns, and ordinary capitalized prose must come back byte-for-byte unchanged;
- the last section shows the documented limitation on purpose: single names and acronyms in free prose stay untouched and belong in a Cloak List.

## Important boundary

Strict mode can detect names and organizations in clear labels (including JSON keys and CSV columns), PowerShell metadata, direct author/contact context, prose cues, and copyright lines. It does not guess every capitalized phrase in normal prose because that would destroy ordinary code comments and documentation — and a built-in name dictionary would miss uncommon and international names while falsely redacting ordinary words such as Mark, Bill, May, Rose, or Main. Use a Cloak List for organization aliases, acronyms, project names, team names, and people you already know must be hidden.
