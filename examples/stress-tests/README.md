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

## Important boundary

Strict mode can detect names and organizations in clear labels, PowerShell metadata, and direct author/contact context. It does not guess every capitalized phrase in normal prose because that would destroy ordinary code comments and documentation. Use a Cloak List for organization aliases, project names, team names, and people you already know must be hidden.
