# Contributing to CloakScan

Thanks for taking a look at the project.

CloakScan handles text that may contain private information, so privacy regressions matter as much as ordinary bugs. Please use synthetic examples in issues, tests, screenshots, and pull requests. Never paste a real key, internal hostname, work log, customer record, employer detail, medical information, or other sensitive value into the repository — not even "just to show the bug".

Two ground rules for reports:

- **Detector gaps:** show them with the smallest synthetic fixture that reproduces the miss (`example.internal`, `DEMO-NOT-REAL`, fake names). If your real case involves private data, rebuild it synthetically first.
- **Security-sensitive findings** (a way to make CloakScan leak, persist, or transmit data it should not): follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Local setup

You need Node.js 20.19+ or 22.12+.

```powershell
npm ci
npm run verify
```

The Windows desktop shell also needs Rust with the stable MSVC toolchain:

```powershell
npm run desktop:verify
```

## Adding or changing a detector

- Keep each detector focused. Do not grow one large regular expression that tries to catch everything.
- Add positive, negative, and overlap tests when relevant.
- Preserve code structure and formatting outside the exact matched value.
- Use obviously fake examples such as `example.internal` and `DEMO-NOT-REAL`.
- Document realistic false positives and missed cases.
- Run `npm run verify` before opening a pull request.

Please read [SECURITY.md](SECURITY.md) before changing persistence, desktop permissions, file handling, or network behavior.
