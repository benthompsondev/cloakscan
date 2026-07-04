# Synthetic sharing draft

This file tests the difference between built-in detection and values that need a Cloak List.

## Support question draft

I am troubleshooting a failed identity import for Northwind Regional Health. The job was part of Project Firefly and was reviewed by the O’Brien Demo Team.

Owner: Alex Demo
RequestedBy: Bea Example
Contact: Chris Sample
Company: Northwind Regional Health
Department: Identity Support Services
Email: chris.sample@example-health.org
UPN template: `$alias@example-health.org`
MailDomain: accounts.example-health.org
Username: csample

The source was:

```text
C:\Users\Chris Sample\Documents\Project Firefly\Private Imports\identity import.csv
```

The output was:

```text
D:\Operations Tools\Project Firefly\Reports\failed users.txt
```

The application also copied a log to:

```text
\\fs01.example.internal\Identity$\Project Firefly\Logs
```

The error came from `id-sync-01.example.internal` at `10.42.16.28`. The related ticket is `INC104892`, and the internal page is `https://admin.example.internal/jobs/104892`.

The temporary configuration contained:

```powershell
$Company = "Northwind Regional Health"
$Team = "O'Brien Demo Team"
$ProjectName = "Project Firefly"
$PrimaryUpn = "$SamAccountName@example-health.org"
$Owner = "Alex Demo"
$Password = "demo-password-not-real"
$Authorization = "Bearer DEMO_NOT_REAL_TOKEN_1234567890"
```

## GitHub issue draft

The sanitization should remove the labeled person and company fields in Strict mode. It should also remove the full email, the `@example-health.org` suffix, the Windows paths including spaces, the UNC path, internal host, private IP, ticket number, internal URL, password literal, and bearer token.

The following values should be added through **Hide custom terms** or a reusable **Cloak List** because they are organization-specific aliases rather than reliably structured data:

- Northwind Regional Health
- Project Firefly
- O'Brien Demo Team
- example-health.org

Common punctuation variants should behave consistently:

- O'Brien Demo Team
- O’Brien Demo Team
- O’Brien   Demo   Team

## Social post draft

Today I cleaned up a PowerShell import used by Northwind Regional Health for Project Firefly. Before posting the example, I need to remove the organization, team, project name, paths, emails, hostnames, and any identifiers that could point back to the original environment.

Public documentation at `https://example.com/help` is intentionally public and may remain. Ordinary phrases such as Deployment Complete, Windows Terminal, and Identity Import should not automatically be treated as people.
