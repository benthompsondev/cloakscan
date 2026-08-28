# Independent detection review of v1.5.1

Scope: an independent second opinion on the v1.5.1 contextual-secret fix
(`4e10f90`), released at `aadbe06`, plus the surrounding pipeline. Every input
in this document is synthetic. No real credential, workplace file, or private
corpus was used, and `npm run test:private-corpus` was not run.

Method: read the shipped promises (README, `docs/detectors.md`,
`PROJECT_SPEC.md`), traced the pipeline
(input → profile → detect → protected ranges → overlap resolution → replace →
preview), then built an independent cross-format matrix from the *documented
intent* rather than from the existing test expectations, and ran it through the
real `scanText` + `buildCleanText` path. Findings were then confirmed in the
running UI on the default Balanced profile.

## Verdict

**The v1.5.1 fix is directionally right but was not general.** The reported
example (`User=Admin Password=password Api_key=A1cdeFgh795=`) is genuinely
fixed, and the move from quote-only matching to contextual same-line value
extraction is the correct design. But the exclusions added alongside it
reintroduced the same *class* of failure the scripting group demonstrated: a
value that is obviously a password is silently skipped because of a rule
written for a different language.

The clearest case: **any password containing a dollar sign was missed in every
format**, including JSON, where `$` has no special meaning at all.

```
{"password":"pa$$word"}   ->  {"password":"pa$$word"}    (v1.5.1: no findings)
PASSWORD=pa$$word         ->  PASSWORD=pa$$word          (v1.5.1: no findings)
```

Separately, **the credential word had to be the last word of the field name**,
so `aws_secret_access_key=…` — arguably the highest-value credential line that
exists in a pasted config — produced no finding at all.

Both are the overfitting the brief suspected: the rules were shaped around
PowerShell scripts and the project's own fixtures.

Two further issues were not detection gaps but pipeline defects: partial
redaction that leaves a credential fragment visible (contradicting the
"No partial redaction, ever" promise already in `docs/detectors.md`), and a
quadratic scan that made the advertised 2 MB import limit unusable.

Detection approach: **pattern matching plus field-name context is the right
approach for this product**, and the refusal to guess from entropy is correct
given the "review leads, not verdicts" framing. The problems were in the
specific rules, not the strategy. No architectural change was warranted.

## Findings, most severe first

To reproduce any of these against the released engine, restore just the two
source files and run the new suite:

```bash
git checkout aadbe06 -- src/lib/detectors/secrets.ts src/lib/scan.ts
npx vitest run src/lib/detectors/secretGaps.test.ts
git checkout HEAD -- src/lib/detectors/secrets.ts src/lib/scan.ts
```

57 of 91 cases fail on the v1.5.1 engine; all 91 pass on this branch.

### 1. A dollar sign anywhere in a value suppressed detection in every format (HIGH, miss)

`src/lib/detectors/secrets.ts`, `isLikelySecretValue`. The check was an
unanchored search:

```js
if (quote !== "'" && /\$(?:\(|\{|[A-Za-z_][A-Za-z0-9_:]*)/.test(value)) return false;
```

Any `$name` *anywhere* in a non-single-quoted value marked the whole value a
variable reference. Confirmed missed at v1.5.1:

| Input | v1.5.1 output |
| --- | --- |
| `{"password":"pa$$word"}` | unchanged |
| `{"db_password":"my$ecret"}` | unchanged |
| `PASSWORD=pa$$word` | unchanged |
| `password: "S3cure$Pass"` | unchanged |
| `passwordHash=$2y$10$abcdefghijklmnop` | unchanged |
| `--password my$ecret` | unchanged |

Two things made this severe. `pa$$word` reads as an interpolation of a variable
called `word`, which no shell or PowerShell does. And a double-quoted JSON
string is not a PowerShell string — `{"password":"a$b"}` has no interpolation
semantics whatsoever. The rule was also inconsistent: the same value was
detected when single-quoted or inside an XML element.

### 2. The credential word had to be the last word of the field name (HIGH, miss)

`SECRET_KEY_PATTERN` was `[A-Za-z0-9_.-]{0,40}(?:password|…|token)` — a free
prefix, then a keyword that had to abut the separator. Anything after the
keyword broke the match. Confirmed missed at v1.5.1:

`aws_secret_access_key=`, `SecretAccessKey=`, `secret_access_key:`,
`SharedAccessKey=` (Azure), `SecretKey=`, `PrivateKey=`, `private_key=`,
`signing_key=`, `encryption_key=`, `session_key=`, `ClientSecretValue=`,
`TokenValue=`, `SecretString=`, `ApiKeyValue=`, `password_value=`, `secret2=`.

`secret2=` missing shows the shape of the bug clearly: a single trailing digit
was enough.

### 3. Partial redaction left credential fragments visible (HIGH, leak)

`src/lib/scan.ts`, `resolveOverlaps`. Overlap resolution keeps exactly one
candidate per region. When a narrow high-priority match sits *inside* a wider
low-priority one, the wider match was discarded and its remainder stayed in the
output:

| Input | v1.5.1 output |
| --- | --- |
| `api_key=sk-abcdefghij1234567890-EXTRA` | `api_key=[API_KEY_1]-EXTRA` |
| `secret=glpat-AAAAAAAAAAAAAAAAAAAA.tail` | `secret=[API_KEY_1].tail` |
| `Password=hunter2 and AKIA<16-char-example> is the key` | `Password=hunter2 and [API_KEY_1] is the key` |

The last row is the important one: the AWS key detector fired, won on priority,
and **left the actual password `hunter2` in the "sanitized" output**. This
directly contradicts `docs/detectors.md`: "**No partial redaction, ever.**"

### 4. A dense 2 MB import took ~27 s and blocked the UI thread (HIGH, usability)

The README advertises "max 2 MB" imports. Measured on this machine
(Windows 11, Node 22), a 2 MB file of dense `key=value` lines:

| Size | v1.5.1 scan | this branch |
| --- | --- | --- |
| 256 KB | 469 ms | 99 ms |
| 512 KB | 1,831 ms | 200 ms |
| 1 MB | 7,245 ms | 571 ms |
| 2 MB | 27,312 ms | 1,846 ms |

Doubling the input quadrupled the time — quadratic, from two independent
causes:

- `hasPowerShellVariablePrefix` called `text.lastIndexOf('\r', labelStart)` on
  LF-only text. There is no `\r` to find, so every call walked the entire
  string backwards. This alone was most of it: `secret-assignment` on 1 MB went
  from 5,095 ms to 47 ms once fixed.
- `resolveOverlaps` compared each candidate against every kept candidate
  (`kept.some(...)`), which is O(n²) at 107,000 candidates.

A single 580 KB line with 40,000 secrets (a minified JSON paste) hit a third
quadratic — slicing the rest of the line per match — and took over two minutes.

### 5. An unquoted value escaped its enclosing string and broke the code (MEDIUM, corruption)

`captureValue` ran an unquoted value to the end of the *line*, ignoring the
string literal it was inside:

```
in : $text -replace 'password=\w+', 'password=redacted'
out: $text -replace 'password=\w+', 'password=[SECRET_1]
```

The closing quote was consumed. The output is no longer valid PowerShell. Note
the regex *pattern* is protected by `protectedRanges`, but the *replacement*
string is not — protection covers only the first argument.

### 6. `pass` inside ordinary English words produced false positives (MEDIUM, FP)

Bare `pass` after any prefix matched real words. At v1.5.1:

```
compass=north      ->  compass=[SECRET_1]
bypass=/etc/hosts  ->  bypass=[SECRET_1]
surpass=100        ->  surpass=[SECRET_1]
lowpass=200        ->  lowpass=[SECRET_1]
```

### 7. Subscript and arrow assignment idioms were not recognized (MEDIUM, miss)

The quoted-label branch required the closing quote to be immediately followed
by the separator, so a `]` in between broke it. Missed at v1.5.1:
`cfg["password"] = "hunter2"`, `$config['password'] = 'hunter2';`,
`os.environ["API_KEY"] = "…"`, and `password => "hunter2"` (which produced the
mangled `password =[SECRET_1]`, capturing `> "hunter2"`).

### 8. A type cast hid the literal behind it (LOW, ambiguous — changed)

`password = [string] "hunter2"` produced no finding: the cast matched
`looksExecutableValue`, which rejected the entire value including the string
literal. The literal is a pasted secret even though the cast is code. Two
existing test expectations asserted the old behavior; both were changed, and
`[char[]]('a','b')` still correctly produces nothing.

## Second-pass review of my own changes

The first commit on this branch was reviewed independently by Codex
(`codex exec --sandbox read-only` against `ff39b1c`), which ran the detector
directly on adversarial input. It found six issues. I reproduced every one
before acting, and five led to fixes:

- **Two were regressions I introduced.** The rule rejecting `pass` fused into a
  lowercase word also threw away `userpass`, `dbpass`, and `mypass` — real
  field names — while still missing `compassHash` and `BYPASS_VALUE`. Replaced
  with an explicit list of the English words. Separately, treating a `:`
  separator as a JSON/YAML key whenever the label was not inside a string was
  far too broad: `echo password: prefix-$PASSWORD` was read as YAML, so the
  shell variable was treated as a literal and redacted, corrupting the command.
  A bare key must now actually open its line.
- **One I had already found and fixed** between the two reviews: the apostrophe
  case (`don't paste password=O'Brien2024`).
- **One was pre-existing.** `password="$1"` passes a shell argument through
  rather than hardcoding one; positional and special parameters now count as
  whole-value expansions.
- **One was a real hole in my own `coverContainingMatches`.** It grew a
  contained match only to the furthest-reaching container, not to the union of
  all of them. With `[0,105]` and `[10,110]` both containing a high-priority
  `[50,60]`, growing to `[10,110]` alone let `[0,105]` be discarded and left
  `[0,10)` visible — the exact partial-redaction class this branch set out to
  close. Now grows to the union, found via a staircase of prefix maxima so it
  stays O(n log n). I could not construct this shape from the current detector
  set, so it is a latent rather than reachable defect, but the fix is cheap and
  the invariant is the point.
- **One was a genuine over-redaction** from the terminator window: a value
  longer than 4096 characters swallowed the next field on the line. The search
  now falls back to the full line when the window finds no terminator, which
  costs nothing in the common case.

Codex found no catastrophic-backtracking issue in the new field-name grammar,
and confirmed the typed-array bounds and the binary-search overlap resolver
hold their stated invariants. I separately ran fourteen adversarial inputs
(50k-character prefixes, repeated near-misses, unbalanced quotes, 220 KB of
CLI flags) against the field-name regex; the slowest was 20 ms.

### Third pass: Codex re-reviewed the full diff

A second `codex exec --sandbox read-only` pass over `aadbe06..f8443f3` found
four more issues. Three were real and are fixed; all were reproduced first.

- **A closing double quote followed by member access was not treated as a
  string end.** `const value = "password=hunter2".trim();` sanitized to
  `const value = "password=[SECRET_1]` — the quote and `.trim();` were eaten,
  leaving invalid JavaScript. The "what follows a closing quote" test existed
  to stop a prose apostrophe from acting as a delimiter, which is a problem
  only single quotes have. A double quote now always closes the string it
  opened; the test is kept for `'` alone.
- **Any double-quoted label was assumed to be a JSON key.** `echo "password":
  prefix-$PASSWORD` was read as structured data, so the shell expansion was
  treated as a literal and redacted, corrupting the command — the same defect
  as the bare-key case fixed in `ed60128`, which I had only half fixed. A
  quoted key must now also sit where a key can: after `{`, `[`, `,`, `:`, or
  the start of the line.
- **`coverContainingMatches` still leaked when a *container* won.** My previous
  fix grew contained candidates to the union of their containers, but left the
  containers themselves alone. With `[0,105]` and `[10,110]` overlapping, a win
  by `[0,105]` left `[105,110)` visible. Growing contained matches was the
  wrong shape of fix: each run of mutually overlapping same-category candidates
  now merges, and every member takes the run's full span, so whichever wins on
  priority covers all of it. This is simpler than the staircase it replaces and
  actually holds the invariant — verified for all three priority orderings.

### Declined, with reasoning

Codex rated `{"password":"$PASSWORD"}` and `{"password":"abc${def}xyz"}` a High
miss, on the grounds that `$` has no interpolation semantics in JSON. That is
true about JSON but not about what the value *is*. In JSON and YAML config,
`${VAR}` and `$VAR` are overwhelmingly deploy-time templating placeholders —
docker-compose, Helm values, appsettings, CI configs — and the literal text
`$PASSWORD` is not a credential. Redacting it would emit `[SECRET_1]` for a
value that reveals nothing and would destroy information the user wants to
keep. A JSON value that opens with `$` and *is* credential material is a crypt
hash, and `CRYPT_HASH_RE` is checked first, so that case is already covered.
Left unchanged deliberately.

Codex also flagged `password="$$word"` being redacted. That is the intended
behavior and the core of this branch: `pa$$word` is a password, and no shell
reads `$$word` as a variable named `word`.

The third pass raised `{"password":"$1"}` producing no finding, on the grounds
that it contradicts the literal-context rationale. The rationale is narrower
than that: in JSON and YAML, a value that merely *contains* `$` is a literal,
but a value that is *entirely* an expansion is a templating placeholder. `$1`,
`$@`, and `${DB}` are whole-value expansions, so they stay excluded, and a
JSON value that opens with `$` and really is credential material is a crypt
hash, which `CRYPT_HASH_RE` tests first. Left unchanged.

## Judged, not changed

These are real behaviors I chose to document rather than "fix", because the
tradeoff genuinely cuts both ways. They are recorded in
`docs/detectors.md` → *Known boundaries*.

- **Mid-value `$name` in an `=` assignment outside JSON/YAML.**
  `PASSWORD=Summer$Rain2024` in a `.env` is still skipped. A shell really does
  expand `$Rain2024`, and redacting `PASSWORD="prefix-$USER"` in a shell script
  corrupts it. I could not find a rule that catches the literal case without
  breaking the interpolation case, so the conservative reading stands where the
  format is ambiguous, and the literal reading applies where it is not (JSON
  keys, YAML keys at line start, doubled `$$`, crypt hashes).
- **`{"password":"true"}`, `"none"`, `"xxxx"`, `"default"` are skipped.** A
  literal password of `xxxx` exists, but these values are overwhelmingly
  configuration or already-redacted logs. Left as v1.5.1 had it.
- **Unquoted values run to end of line.** `Password=hunter2 was rotated
  yesterday` redacts the trailing words. Stopping at the first space would
  leave part of a passphrase visible; the existing tests already encode this
  choice deliberately and I agree with it. The visible cost is that
  `# password: see the vault entry` produces a finding over the comment text.
- **`nextPageToken`, `csrf_token` are redacted.** Rarely credentials, but the
  field name is ambiguous and over-redaction is the safer error here.
- **`authorization` was tried as a field name and removed.** Adding it caught
  `authorization: abc123def456` but also produced
  `authorization: [SECRET_1]` for `authorization: pending review` — ordinary
  support-text prose, a primary use case. The credential-bearing forms are
  already covered by `bearer-token`, the Basic-auth pattern, and the provider
  key shapes, so the bare word was dropped.

## What changed

`src/lib/detectors/secrets.ts`

- Field-name grammar split into core words, compound names
  (`secret_access_key`, `shared_access_key`, `private_key`, `signing_key`, …),
  and an allowlisted qualifier tail (`value`, `string`, `hash`, `text`, `data`,
  `b64`, digits). Metadata suffixes (`_file`, `_path`, `_length`, `_name`,
  `_command`) deliberately still fall through.
- `isCredentialFieldName` rejects a bare `pass` fused into a lowercase English
  word, case-sensitively, so `compass` is out and `SmtpUserPass` and `ftp_pass`
  stay in. The first attempt at this — requiring a separator — broke
  `$SmtpUserPass`, which the existing PowerShell tests correctly caught.
- Dollar-sign handling rewritten: whole-value expansions (`$cred`, `${DB}`,
  `$(cmd)`, `%VAR%`), embedded `${`/`$(`, and PowerShell-context interpolation
  are still skipped; doubled `$$`, crypt-hash prefixes, and JSON/YAML key
  contexts are treated as literal.
- Assignment separator accepts an optional `]` and `=>`.
- `buildLineIndex` precomputes line bounds and open-quote state in two linear
  passes; an unquoted value is now bounded by its enclosing string. A closing
  quote only bounds the value when what follows it reads like the end of a
  string — an apostrophe in prose (`it's password=ab'cd`) is not a delimiter,
  and the first version of this change cut the value there and left `'cd`
  visible. Caught by my own edge probe before commit; the regression is in
  `secretGaps.test.ts`.
- Terminator search is windowed (4096 chars) instead of slicing the rest of the
  line per match.

`src/lib/scan.ts`

- `coverContainingMatches` grows each candidate to the widest *same-category*
  candidate containing it, before overlap resolution. The specific detector
  still wins on priority; it just covers the whole credential. Same-category
  only, so a hostname inside a path is not relabelled.
- `resolveOverlaps` uses binary search against the start-ordered kept list
  instead of scanning it.

`docs/detectors.md` — new v1.5.2 section and five new entries under *Known
boundaries*.

`src/lib/detectors/secretGaps.test.ts` — new, 91 cases including a bounded 2 MB
performance regression.

`src/lib/detectors/secrets.test.ts` — two expectations changed (finding 8).

## Coverage and results

My matrix, reported as the brief asked — misses and unintended redactions
separately. This is evidence of *this* coverage, not an accuracy percentage.

Measured by restoring the v1.5.1 `secrets.ts` + `scan.ts` and running the same
91-case suite against each engine. Failures by area, v1.5.1 → this branch:

| Area | Kind | v1.5.1 | this branch |
| --- | --- | --- | --- |
| Field name where the credential word is not last | miss | 12 | 0 |
| Literal dollar signs in a value | miss / FP | 9 | 0 |
| `pass` inside an ordinary English word | FP | 5 | 0 |
| Shell positional and special parameters | FP / miss | 5 | 0 |
| Subscript and arrow assignment idioms | miss | 5 | 0 |
| Colon separator read as JSON/YAML | miss / corruption | 4 | 0 |
| Overlapping runs leaving an uncovered head or tail | leak | 4 | 0 |
| Closing double quote followed by member access | corruption | 3 | 0 |
| Unquoted value escaping its enclosing string | corruption | 3 | 0 |
| Provider key inside a wider secret | leak | 3 | 0 |
| Quoted key that is not in a structured position | corruption | 2 | 0 |
| PowerShell type cast over a literal | miss | 1 | 0 |
| Dense 2 MB scan within a 10 s bound | performance | 1 | 0 |
| **Total** | | **57 / 91** | **0 / 91** |

Grouped the way the brief asked: **27 were missed secrets**, **14 were
unintended redactions**, **15 were exact output or boundary failures** (a
credential fragment left visible or a line broken), and **1 was the
performance bound**.

Formats exercised: plain text, `.env`/INI, JSON (compact and spaced), YAML
(quoted, plain, indented, list item), XML elements and key/value attributes,
CLI flags (`--flag value`, `--flag=value`, `-Flag value`), PowerShell
(assignment, scoped, hashtable, `-replace`, `switch -Regex`, casts,
`ConvertTo-SecureString`), shell `export`/`set`, JavaScript, Python, PHP.
Varied across: casing, `_`/`-`/`.` separators, quoting style, spacing, escaped
quotes, CRLF and LF, non-ASCII values, and multiple secrets per line.

Independently exercised provider shapes: AWS access key ID and secret access
key, Stripe, OpenAI, Anthropic, GitHub (classic and fine-grained), GitLab,
Slack (token and webhook), Google API and OAuth, SendGrid, Twilio, npm, Azure
Storage account key and SAS signature, HashiCorp Vault, DigitalOcean, Docker,
Hugging Face, Databricks, Shopify, Netlify, Brevo, age, Discord, Telegram,
bearer tokens, JWTs, Basic auth headers, credential-bearing URLs, ADO/ODBC
connection strings, and PEM/OpenSSH/PGP private-key blocks — each paired with a
close non-match. Provider formats were taken from the existing synthetic
fixtures in `src/lib/synthetic.ts`; no credential was tested against any live
service.

Also verified: rescanning sanitized output is stable (no drift on a second
pass), placeholder reuse for repeated values, protected PowerShell regex
ranges, both Safe-share and Portfolio-code output modes, and Balanced / Strict /
Maximum / Code & secrets profiles.

## Commands run

| Command | Result |
| --- | --- |
| `npx vitest run` (at `aadbe06`) | 757 passed — baseline |
| `npx vitest run` (this branch) | 890 passed |
| `npm run verify` | 0 vulnerabilities; lint clean; 890 unit; build ok; 86 e2e passed, 10 skipped |
| `npm run desktop:verify` | build ok; 9 Rust tests passed |
| `cargo fmt --check` | clean |
| `cargo clippy … -D warnings` | clean |
| `git diff --check` | clean |
| `npm run preview` + browser | manual check on Balanced, both output modes, no console errors |

The 10 skipped e2e tests are the screenshot-capture specs, skipped by the same
guard as in the released run — not a result of these changes.

## Not verified

- **The installed Windows app upgrade flow.** Not tested, same gap as the
  v1.5.1 release notes. Browser and `cargo test` results do not establish it.
- **Packaging, checksums, and updater signatures.** No release artifacts were
  built.
- **The private-corpus harness.** `npm run test:private-corpus` was not run;
  running it needs Ben's explicit selection and authorization.
- **Real-world false-positive rate.** My negative controls are synthetic and
  hand-chosen. They show the specific FPs found are gone; they do not measure a
  rate.
- **Single-line inputs at the extreme.** A 580 KB one-line paste with 40,000
  secrets improved from over two minutes to ~4.7 s but is still the slowest
  shape. Ordinary multi-line files at 2 MB are ~1.9 s.
- **The last two commits were not independently reviewed.** Codex reviewed
  `ff39b1c`. The three commits after it — which fix findings from that review,
  including the ones it raised — have only my own tests and probes behind them.
  A second Codex pass over `aadbe06..f8443f3` would close that gap.
- **The `codex:codex-reviewer` subagent could not run at all.** A broken
  PreToolUse hook from the installed `railway` plugin
  (`hooks/auto-approve-api.sh`) crashes on every Bash invocation in this
  session, and that subagent has only the Bash tool. The review was obtained by
  calling `codex exec --sandbox read-only` through PowerShell instead. The hook
  is unrelated to CloakScan and was left alone.

## Web-demo readiness pass

A later pass targeted the live GitHub Pages demo specifically, starting from a
new frozen outsider corpus (`src/lib/outsiderCorpus.ts`, 41 cases) written
before any of it was run — deliberately not derived from the hardening suite
above, and deliberately weighted away from PowerShell.

It found four more defects, all in the shipped detector:

- **A trailing qualifier on a field name silently killed the match.** The tail
  was an allowlist of credential-naming words, so `PASSWORD_OLD`,
  `PASSWORD_NEW`, `DB_PASSWORD_PROD`, `API_KEY_V2`, `TOKEN_STAGING`,
  `PASSWORD_A` and `password_2` produced no finding at all. Now a denylist of
  metadata words: a qualifier says *which* credential and is still the
  credential, while `password_file`, `password_length`, `api_key_name`,
  `token_endpoint` and `private_key_path` still fall through.
- **Code that reads a secret from elsewhere was redacted as if it were one.**
  `API_KEY = os.environ["OPENAI_API_KEY"]` became `API_KEY = [SECRET_2]`, and
  `authToken: process.env.AUTH_TOKEN` lost its trailing comma as well. That
  deletes working code and hides nothing.
- **A hyphenated lowercase value was mistaken for a PowerShell cmdlet**, so
  `password=unquoted-value` and `password=correct-horse` were skipped.
- **`mysql -pSecret` was missed twice over** — the family attaches the password
  to the flag, and CLI values were judged against the whole rest of the line,
  so `--password secret --verbose` was read as a command with a flag and
  dropped entirely.

One regression was caught mid-change and fixed before commit: allowing a space
in the new field-name tail let a label run across ordinary words, so
`Reset your password at https://accounts.example.com/reset` parsed as the field
`password at https` and redacted the URL.

### Verified through the real web path

The GitHub Pages artifact (`npm run build:pages`, base `/cloakscan/`) was served
and driven in a real browser, not just through detector functions. A composite
document covering every high-risk format produced output **byte-identical** to
the Node library (SHA-256 `80b4f9a9…`, 489 chars), which is what establishes
that the deployed bundle carries the hardened scanner rather than a stale one.

Copy and Download both emitted exactly the sanitized text with no original
secret present. Toggling a finding off restored the original and the readiness
summary correctly reported "1 finding (1 high) kept as-is — the original value
is still in the output".

Local-first was verified by attack rather than by reading the source. From the
page, `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, and an image request
with the secret in its query string were all blocked by the Content Security
Policy (`connect-src 'none'`), and **no request reached the external host**.
After scanning, `localStorage`, `sessionStorage`, IndexedDB and cookies were all
empty, and the URL carried no query or fragment. The production bundle contains
no analytics, telemetry, or third-party host: its only absolute URLs are XML
namespaces, GitHub repository links, and the demo's own canonical URL.

Performance, click to rendered preview, on dense synthetic logs with a secret
roughly every 135 characters:

| Input | Time |
| --- | --- |
| 50 KB | 62 ms |
| 200 KB | 214 ms |
| 500 KB | 488 ms |
| 1 MB | 1.6 s |
| 2 MB (the advertised import limit) | 5.4 s |
| 300 KB on a single line | 831 ms |

Ordinary developer-sized input is well under half a second. The 2 MB figure is a
worst case — maximum supported size at maximum credential density, about 120,000
findings — and it completes rather than hanging.

## A note on the private-corpus harness

I read `tools/private-corpus.test.ts` and `vitest.corpus.config.ts` but did not
run them. The safeguards are sound: the corpus root comes only from
`CLOAKSCAN_PRIVATE_CORPUS`, the suite skips cleanly when it is unset, files are
read-only, and output is aggregate counts per detector and category — no
values, no file names, no paths, and errors reduced to generic counts.

Two things worth knowing before relying on it:

- **It only collects `.ps1`, `.psm1`, and `.psd1`.** Whatever confidence it has
  been giving is confidence about PowerShell. That is consistent with how the
  gaps in this review cluster: the missed shapes were JSON, YAML, `.env`,
  Python/JS subscripts, and AWS-style field names — exactly the formats the
  corpus never contained.
- **Aggregate counts cannot answer the question this change raises.** A total
  going up tells you nothing about whether the new redactions are correct. The
  harness deliberately cannot print spans, and it should stay that way.

## Recommended next step

The main gap this review exposed has since been closed in the same branch.
`src/lib/outsiderCorpus.ts` is that second, fully synthetic non-PowerShell
corpus: 41 cases across `.env`, JSON, YAML, Terraform, Docker Compose, Python,
TypeScript, INI, logs and command output, with hand-written expected output and
a runner that joins the normal `npm test`. It found four further defects on its
first run, listed under the web-demo readiness pass above.

What is still worth doing is the real-shaped check. Run the existing
private-corpus harness on a corpus Ben explicitly selects and compare the
per-detector counts
before and after this branch. Treat a large jump in `secret-assignment` as a
prompt to hand-check a few files locally, not as a result in itself.
