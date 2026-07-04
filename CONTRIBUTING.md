# Contributing to CloakGuard

Thanks for taking a look at the project.

CloakGuard handles text that may contain private information, so privacy regressions matter as much as ordinary bugs. Please use synthetic examples in issues, tests, screenshots, and pull requests. Never paste a real key, internal hostname, work log, customer record, or other sensitive value into the repository.

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
