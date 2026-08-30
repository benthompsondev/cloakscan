import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/**
 * Well-known API key formats. One small pattern per provider family keeps
 * this list easy to review and extend.
 */
const API_KEY_PATTERNS: RegExp[] = [
  // When `_` is not legal in a provider body, use an alphabet-specific
  // lookahead instead of `\b`: underscore is a regex word character, so `\b`
  // would miss an otherwise complete token immediately followed by `_more`.
  /\bsk[-_](?:live|test)[-_][A-Za-z0-9]{8,}(?![A-Za-z0-9])/g, // Stripe-style
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g, // OpenAI project key
  /\bsk-[A-Za-z0-9]{20,}(?![A-Za-z0-9])/g, // OpenAI-style
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Z])/g, // AWS long-term or temporary access key ID
  // GitHub tokens. The body accepts underscores so a token butted against more
  // word characters still matches, and matches as one run: with a bare
  // [A-Za-z0-9] body the trailing \b could never be satisfied before a `_`, so
  // `ghp_<36>_more` produced no finding at all rather than a partial one.
  /\bgh[pousr]_(?:[A-Za-z0-9]{36}(?=(?:password|passwd|passphrase|secret|token|api[-_.]?key)=)|[A-Za-z0-9_]{20,}\b)/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API key
  /\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{20,}\b/g, // Anthropic API key
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g, // GitLab personal/project access token
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, // GitHub fine-grained token
  /\b[rp]k_(?:live|test)_[A-Za-z0-9]{10,}\b/g, // Stripe restricted/publishable key
  /\b(?:AC|SK)[0-9a-fA-F]{32}\b/g, // Twilio account/API key SID
  /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, // SendGrid API key
  /\bnpm_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g, // npm access token
  /\bya29\.[A-Za-z0-9_-]{20,}\b/g, // Google OAuth access token
  /\bAccountKey=[A-Za-z0-9+/]{86,}==/g, // Azure Storage account key assignment
  /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]{8,}\/B[A-Za-z0-9]{8,}\/[A-Za-z0-9_-]{20,}/g, // Slack incoming webhook
  /\bAuthorization:[ \t]*Basic[ \t]+[A-Za-z0-9+/]{12,}={0,2}/gi, // HTTP Basic authorization header
  /\bdop_v1_[0-9a-f]{64}\b/g, // DigitalOcean personal access token
  /\bpypi-[A-Za-z0-9_-]{50,}\b/g, // PyPI upload token
  /\bdckr_pat_[A-Za-z0-9_-]{20,}\b/g, // Docker access token
  /\bhf_[A-Za-z0-9]{30,}(?![A-Za-z0-9])/g, // Hugging Face user access token
  /\bhvs\.[A-Za-z0-9_-]{20,}\b/g, // HashiCorp Vault service token
  /\bdapi[0-9a-f]{32}(?![0-9a-f])/g, // Databricks personal access token
  /\bshp(?:at|ca|pa|ss)_[0-9a-f]{32}\b/g, // Shopify access tokens
  /\bglrt-[A-Za-z0-9_-]{20,}\b/g, // GitLab runner authentication token
  /\bnfp_[A-Za-z0-9]{30,}\b/g, // Netlify personal access token
  /\bxkeysib-[0-9a-f]{64}\b/g, // Brevo API key
  /\bAGE-SECRET-KEY-1[A-Z0-9]{58}\b/g, // age identity secret key
  /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g, // Discord webhook
  /(?<!\d)\d{8,10}:AA[A-Za-z0-9_-]{32,33}\b/g, // Telegram bot token, including /bot<TOKEN>
  /(?<=[?&]sig=)[A-Za-z0-9%+/_=-]{20,}/gi, // Azure SAS signature value
  /(?<=[?&]X-Amz-Signature=)[0-9a-f]{64}(?=&|$)/gi, // S3 presigned URL signature value
];

const API_KEY_PLACEHOLDER_RE = /(?:not[-_ ]?a[-_ ]?real|placeholder|insert[-_ ]?key)/i;

function isApiKeyPlaceholder(value: string): boolean {
  return API_KEY_PLACEHOLDER_RE.test(value) || /^AIzaA+$/i.test(value);
}

export const apiKeyDetector: Detector = {
  id: 'api-key',
  name: 'API key',
  category: 'secrets',
  severity: 'high',
  label: 'API_KEY',
  priority: 92,
  explanation: 'Matches a known API key format. Leaked keys grant direct account access.',
  detect: (text) =>
    API_KEY_PATTERNS.flatMap((re) => regexMatches(text, re)).filter(
      (match) => !isApiKeyPlaceholder(match.value),
    ),
};

/** "Bearer <token>" — the scheme word plus the credential that follows it. */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9\-._~+/]{8,}=*/g;

export const bearerTokenDetector: Detector = {
  id: 'bearer-token',
  name: 'Bearer token',
  category: 'secrets',
  severity: 'high',
  label: 'TOKEN',
  priority: 95,
  explanation: 'Authorization bearer tokens allow anyone holding them to act as the user.',
  detect: (text) => regexMatches(text, BEARER_RE),
};

/**
 * JWT-shaped tokens: three base64url segments where the header starts with
 * "eyJ" ({" in base64). Signature segment may be empty (alg "none").
 */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;

export const jwtDetector: Detector = {
  id: 'jwt',
  name: 'JWT token',
  category: 'secrets',
  severity: 'high',
  label: 'TOKEN',
  priority: 90,
  explanation: 'JWTs often carry live session credentials and decodable identity claims.',
  detect: (text) => regexMatches(text, JWT_RE),
};

/**
 * Sensitive field names, in three groups.
 *
 * Core words may follow any prefix, so OPENAI_API_KEY and PGPASSWORD match.
 * Compound names exist because the credential word is not always last:
 * aws_secret_access_key and SharedAccessKey end in "key", which is far too
 * generic on its own. Short words are the ambiguous ones — see
 * isCredentialFieldName for the boundary rule that keeps SmtpUserPass while
 * dropping compass and bypass.
 */
// "authorization" is deliberately absent: in support text it is an ordinary
// English word ("authorization: pending review"), and the header forms that
// carry real credentials are already covered by bearer-token, the Basic-auth
// pattern, and the provider key shapes.
const CORE_SECRET_WORDS = String.raw`password|passwd|passphrase|secret|credential|api[-_. ]?key|auth[-_. ]?token|access[-_. ]?token|refresh[-_. ]?token|token`;
const COMPOUND_SECRET_WORDS = String.raw`(?:secret|shared)[-_. ]?access[-_. ]?key|(?:secret|private|signing|encryption|session|account|client)[-_. ]?key`;
const SHORT_SECRET_WORDS = String.raw`pass|pwd`;


/**
 * Words that describe a credential without being one, so a field name ending
 * in them is metadata: password_file, password_length, api_key_name,
 * token_endpoint, private_key_path.
 *
 * This is a denylist because the two sets are shaped differently. The metadata
 * words are a small closed set; the ways to say *which* credential are not —
 * PASSWORD_OLD, PASSWORD_NEW, DB_PASSWORD_PROD, API_KEY_V2, TOKEN_STAGING,
 * PASSWORD_A. An allowlist of qualifier words missed every one of those.
 */
const CREDENTIAL_METADATA_WORDS = String.raw`file|filename|files|path|dir|directory|folder|length|len|size|name|names|command|cmd|policy|type|format|algorithm|alg|expiry|expires|expiration|ttl|required|enabled|disabled|count|id|ids|url|uri|endpoint|prompt|field|label|version|arn|hint|rotation|status|store|vault|manager|regex|pattern|placeholder|example|strength|attempts|history|reset|min|max|age|column|header|schema|doc|docs|help|form|input|check|rule|rules`;

/**
 * At most two trailing qualifier segments, none of them a metadata word.
 * `password_reset_url` stops at the denied `url`, leaving `_url` before the
 * separator so the label never matches — which is the intent.
 *
 * The separator deliberately excludes a space. With an open-ended denylist, a
 * space would let the label run across ordinary words: "Reset your password at
 * https://..." parsed as the field `password at https`, redacting the URL.
 */
const SECRET_NAME_TAIL =
  String.raw`(?:[-_.]?(?!(?:${CREDENTIAL_METADATA_WORDS})\b)[A-Za-z0-9]{1,16}){0,2}`;

const SECRET_KEY_PATTERN =
  String.raw`[A-Za-z0-9_.-]{0,40}` +
  String.raw`(?:${COMPOUND_SECRET_WORDS}|${CORE_SECRET_WORDS}|${SHORT_SECRET_WORDS})` +
  SECRET_NAME_TAIL;

/**
 * English words that happen to end in "pass". The set is small and closed, so
 * naming them beats any structural rule: an earlier attempt that rejected
 * "pass" fused to lowercase letters also threw away userpass, dbpass, and
 * mypass, which are real field names.
 */
const ENGLISH_PASS_WORD_RE = new RegExp(
  String.raw`(?:^|[^A-Za-z])(?:com|by|sur|encom|over|under|tres|low|high|band)pass` +
    SECRET_NAME_TAIL +
    '$',
  'i',
);

/** Reject labels whose only credential word is an accident of English. */
function isCredentialFieldName(label: string): boolean {
  return !ENGLISH_PASS_WORD_RE.test(label);
}

/**
 * Assignment labels, including quoted JSON keys and PowerShell variables.
 * The optional `]` covers subscript assignment (`cfg["password"] = ...`), and
 * `=>` covers hash-literal syntax. Group 3 is the separator: `:` means a
 * JSON/YAML/JS key, which changes how a `$` in the value is read.
 */
const ASSIGNMENT_LABEL_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9_])(["']?)(${SECRET_KEY_PATTERN})\1[ \t]*\]?[ \t]*(=>|:=|=|:(?!:))[ \t]*`,
  'gi',
);

/** CLI arguments whose literal value follows the flag rather than an equals sign. */
const CLI_SECRET_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9_-])(?:--?|/)(${SECRET_KEY_PATTERN})[ \t]+`,
  'gi',
);

/**
 * The MySQL family attaches the password to the flag: `mysql -u root -pSecret`.
 * Scoped to those commands on purpose — a bare `-p` means the port to psql and
 * plenty of other tools, so this cannot be generalized.
 */
const MYSQL_INLINE_PASSWORD_RE =
  /\bmysql(?:dump|admin|show|check|import)?\b[^\r\n]{0,200}?[ \t]-p(?=[^\s-])/g;

/** Simple same-line XML secret elements. Attributes are deliberately not crossed. */
const XML_SECRET_RE = new RegExp(
  String.raw`<(${SECRET_KEY_PATTERN})(?:[ \t]+[^>\r\n]*)?>([^<\r\n]+)</\1[ \t]*>`,
  'gi',
);

const XML_TAG_RE = /<[A-Za-z_:][^>\r\n]*>/g;

/** A following field assignment terminates an unquoted value on the same line. */
const NEXT_FIELD_RE =
  /[ \t]+(?=["']?[A-Za-z_][A-Za-z0-9_.-]{0,63}["']?[ \t]*(?::=|=|:))/i;

/** Placeholder-looking values we should not re-flag, e.g. [SECRET_1] or <redacted>. */
const LOOKS_REDACTED =
  /^(?:<(?:redacted|removed|hidden)>|x{4,}|\*{4,}|redacted|removed|hidden|none|null)$/i;
const NUMBERED_BRACKET_PLACEHOLDER = /^\[[A-Z][A-Z0-9_]*_[0-9]+\]$/;
const COMMON_BRACKET_PLACEHOLDER = /^\[(?:redacted|secret|hidden|removed)\]$/i;
const TEMPLATE_PLACEHOLDER =
  /^(?:\{\{[^{}\r\n]{1,200}\}\}|<(?:YOUR|MY|INSERT|REPLACE)[-_ A-Z0-9]{1,80}>|change[-_ ]?me)$/i;

/**
 * `apiKey: string;` declares a type, it does not set a credential. Redacting
 * the type keyword turned valid TypeScript into code that no longer parses.
 * A union is only a type if every member is, so `secret: string | null` is a
 * declaration while `password: string-cheese-42` stays a value.
 */
const TYPE_KEYWORD_RE =
  /^(?:string|number|boolean|bigint|symbol|object|any|unknown|never|void|null|undefined|true|false|Date|Buffer|RegExp)(?:\[\])?$/i;

function isTypeAnnotation(value: string): boolean {
  // On an inline object type the value runs past the annotation, as in
  // `{ apiKey: string; }`, so read up to the closing brace and drop the
  // member separator before judging what is left.
  const annotation = (/^[^}]*/.exec(value.trim())?.[0] ?? '').replace(/[;,]\s*$/, '').trim();
  if (!annotation) return false;
  return annotation
    .split('|')
    .map((member) => member.trim())
    .every((member) => TYPE_KEYWORD_RE.test(member));
}

/** Config words that follow pass/secret-style keys but are not credentials. */
const BOOLEANISH = new Set([
  'true', 'false', 'yes', 'no', 'on', 'off', 'null', 'none', 'default', 'auto',
  'enabled', 'disabled', 'prompt', 'continue', 'stop', 'silentlycontinue', 'ignore', 'inquire',
]);

/**
 * crypt(3)/PHC hash prefixes: $2y$, $6$, $argon2id$. These open with a dollar
 * sign but are literal credential material, not a variable reference.
 */
const CRYPT_HASH_RE = /^\$[0-9a-z][0-9a-z-]{0,11}\$/i;

/**
 * The whole value is one variable/expansion: $cred, ${DB}, $(cmd), %VAR%, or a
 * shell positional/special parameter such as $1 or $@ — `password="$1"` passes
 * an argument through, it does not hardcode one.
 */
const WHOLE_EXPANSION_RE =
  /^(?:\$(?:\{[^}]*\}|\([^)]*\)|[A-Za-z_][A-Za-z0-9_:.]*|[0-9]+|[@*#?!$-])|%[A-Za-z_][A-Za-z0-9_]*%)$/;

/** Brace or subshell expansion anywhere in the value: "a${b}c", "x$(cmd)". */
const EMBEDDED_EXPANSION_RE = /\$[({]/;

/**
 * A `$name` that is not itself preceded by a dollar sign. `pa$$word` is a
 * password, not an interpolation of a variable called `word` — no shell or
 * PowerShell reads `$$name` that way.
 */
const INTERPOLATION_RE = /(?<!\$)\$[A-Za-z_][A-Za-z0-9_:]*/;

/**
 * A value that could plausibly be a string built from variable references:
 * `$name` plus identifier and path glue, as in "prefix-$user" or
 * "$HOME/secrets". Redacting one of those corrupts a working script.
 *
 * Password punctuation is not glue. `P@ss!2024$xyz*` carries @, ! and *, which
 * no shell would produce by expanding a variable into a path or identifier, so
 * the dollar there belongs to the literal. Requiring both this shape and a
 * `$name` before skipping keeps templates safe without losing a password that
 * merely contains a dollar.
 */
const INTERPOLATION_GLUE_ONLY_RE = /^[A-Za-z0-9_\-./:\\ \t$]*$/;

/** `{}`, `[]`, `()`: a replacement token such as xargs -I {}, never a secret. */
const EMPTY_STRUCTURAL_PLACEHOLDER = /^(?:\{\}|\[\]|\(\))$/;

interface ValueContext {
  quote?: '"' | "'" | null;
  /**
   * True when the field is a JSON/YAML/JS object key, where `$` is an ordinary
   * character. `{"password":"pa$$word"}` is not a PowerShell interpolation.
   */
  dollarsAreLiteral?: boolean;
}

function isLikelySecretValue(value: string, context: ValueContext = {}): boolean {
  const { quote = null, dollarsAreLiteral = false } = context;
  if (
    LOOKS_REDACTED.test(value) ||
    NUMBERED_BRACKET_PLACEHOLDER.test(value) ||
    COMMON_BRACKET_PLACEHOLDER.test(value) ||
    TEMPLATE_PLACEHOLDER.test(value) ||
    EMPTY_STRUCTURAL_PLACEHOLDER.test(value)
  ) {
    return false;
  }
  if (quote !== "'" && !CRYPT_HASH_RE.test(value)) {
    if (WHOLE_EXPANSION_RE.test(value) || EMBEDDED_EXPANSION_RE.test(value)) return false;
    if (
      !dollarsAreLiteral &&
      INTERPOLATION_RE.test(value) &&
      INTERPOLATION_GLUE_ONLY_RE.test(value)
    ) {
      return false;
    }
  }
  if (BOOLEANISH.has(value.toLowerCase())) return false;
  if (isTypeAnnotation(value)) return false;
  // A PowerShell cmdlet, not a value: Get-Secret, New-Guid, Generate-Password.
  // Capitalized on both sides, because `unquoted-value`, `correct-horse`, and
  // `my-secret-value` are hyphenated passwords, not commands. Lowercase
  // cmdlets assigned to a `$var` are already covered by powerShellAssignment.
  if (!quote && /^\(?[A-Z][a-z]+-[A-Z][A-Za-z0-9]*(?:\)?(?:[ \t]|$))/.test(value)) return false;
  return true;
}

/**
 * Roots that only ever introduce a lookup of a value held somewhere else.
 * `API_KEY = os.environ["OPENAI_API_KEY"]` and `authToken: process.env.TOKEN`
 * hide nothing — redacting them removes working code and no secret.
 */
const REFERENCE_ROOTS = String.raw`os|process|sys|config|cfg|conf|settings|env|self|this|secrets|vault|params|args|argv|options|opts|context|ctx|window|globals`;

/**
 * A reference expression rather than a literal: either a known lookup root
 * followed by member access, or any identifier chain that ends in a subscript
 * or a call. A bare dotted value such as `My.Secret.Value` is deliberately not
 * covered — that could be a real password.
 */
const REFERENCE_EXPRESSION_RE = new RegExp(
  String.raw`^(?:(?:${REFERENCE_ROOTS})(?:\.[A-Za-z_$][\w$]*|\[[^\]\r\n]*\]|\([^)\r\n]*\))+` +
    String.raw`|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\[[^\]\r\n]*\]|\([^)\r\n]*\))+)[ \t]*[,;]?$`,
);

function looksExecutableValue(value: string): boolean {
  const trimmed = value.trimStart();
  return (
    REFERENCE_EXPRESSION_RE.test(trimmed.trimEnd()) ||
    /^@(?:\(|\{|["'][ \t]*$)/.test(trimmed) ||
    /^&(?:[ \t]+|["'$])/.test(trimmed) ||
    /^(?:\.{1,2}[\\/])\S+\.(?:ps1|psm1|psd1|bat|cmd|exe)\b/i.test(trimmed) ||
    /^\[[A-Za-z_][A-Za-z0-9_.]*(?:\[\])?\][ \t]*(?=\S)/.test(trimmed) ||
    /^\{[ \t]*(?:[$&]|[A-Za-z_][A-Za-z0-9_.-]*(?:[ \t]+|[ \t]*\())/.test(trimmed) ||
    /^\.\s/.test(trimmed) ||
    /^[A-Za-z_][A-Za-z0-9_.-]*[ \t]*\(/.test(trimmed) ||
    /^\([A-Za-z_][A-Za-z0-9_.-]*[ \t]*\(/.test(trimmed) ||
    /^\([A-Z][A-Za-z0-9_.-]*[A-Z][A-Za-z0-9_.-]*\)/.test(trimmed) ||
    /^[A-Za-z_][A-Za-z0-9_.-]*[ \t]+-[A-Za-z]/.test(trimmed)
  );
}

const QUOTE_NONE = 0;
const QUOTE_SINGLE = 1;
const QUOTE_DOUBLE = 2;

/**
 * Per-character line bounds and open-quote state, built in two linear passes.
 *
 * Every lookup here used to walk backwards or forwards from the match, which
 * is fine for ordinary lines and quadratic for the one-line files people
 * actually paste — minified JSON, a single long log record. One shared index
 * makes each lookup O(1).
 */
interface LineIndex {
  lineStart: Int32Array;
  lineEnd: Int32Array;
  quote: Uint8Array;
}

function buildLineIndex(text: string): LineIndex {
  const length = text.length;
  const lineStart = new Int32Array(length + 1);
  const lineEnd = new Int32Array(length + 1);
  const quote = new Uint8Array(length + 1);

  let start = 0;
  let open = QUOTE_NONE;
  let skipNext = false;
  for (let index = 0; index < length; index += 1) {
    lineStart[index] = start;
    quote[index] = open;
    const char = text[index];
    if (char === '\n' || char === '\r') {
      start = index + 1;
      open = QUOTE_NONE;
      skipNext = false;
      continue;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (open === QUOTE_SINGLE) {
      if (char === "'") {
        if (text[index + 1] === "'") skipNext = true;
        else open = QUOTE_NONE;
      }
      continue;
    }
    if (open === QUOTE_DOUBLE) {
      if (char === '\\' || char === '`') skipNext = true;
      else if (char === '"') open = QUOTE_NONE;
      continue;
    }
    if (char === "'") open = QUOTE_SINGLE;
    else if (char === '"') open = QUOTE_DOUBLE;
  }
  lineStart[length] = start;
  quote[length] = open;

  let end = length;
  for (let index = length - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (char === '\n' || char === '\r') end = index;
    lineEnd[index] = end;
  }
  lineEnd[length] = length;

  return { lineStart, lineEnd, quote };
}

function enclosingQuote(index: LineIndex, at: number): '"' | "'" | null {
  const open = index.quote[at];
  if (open === QUOTE_SINGLE) return "'";
  if (open === QUOTE_DOUBLE) return '"';
  return null;
}

function hasPowerShellVariablePrefix(text: string, index: LineIndex, labelStart: number): boolean {
  return /\$(?:[A-Za-z_][A-Za-z0-9_]*:)?$/i.test(
    text.slice(index.lineStart[labelStart], labelStart),
  );
}

function findClosingQuote(
  text: string,
  valueStart: number,
  endOfLine: number,
  quote = text[valueStart],
): number {
  for (let index = valueStart + 1; index < endOfLine; index += 1) {
    if (text[index] !== quote) continue;

    let backslashes = 0;
    for (let cursor = index - 1; cursor > valueStart && text[cursor] === '\\'; cursor -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 1 || text[index - 1] === '`') continue;
    if (quote === "'" && text[index + 1] === "'") {
      index += 1;
      continue;
    }
    return index;
  }
  return endOfLine;
}

/** `[string] "literal"` — the cast is code, but the literal behind it is not. */
const CAST_BEFORE_LITERAL_RE = /^\[[A-Za-z_][A-Za-z0-9_.]*(?:\[\])?\][ \t]*(?=["'])/;

/** Offset of the token that ends an unquoted value, or -1 if `tail` has none. */
function findValueTerminator(tail: string): number {
  let cut = -1;
  const consider = (at: number) => {
    if (at !== -1 && (cut === -1 || at < cut)) cut = at;
  };
  consider(tail.search(NEXT_FIELD_RE));
  consider(
    tail.search(/[,;}][ \t]*(?=["']?[A-Za-z_][A-Za-z0-9_.-]{0,63}["']?[ \t]*(?::=|=|:))/),
  );
  consider(tail.search(/&(?=[A-Za-z_][A-Za-z0-9_.-]{0,63}=)/));
  consider(tail.search(/[ \t]+(?:#|\/\/)/));
  return cut;
}

/** How far past an unquoted value we look for the token that ends it. */
const TERMINATOR_WINDOW = 4096;

/**
 * What may follow a closing single quote for it to have really ended a string.
 *
 * An apostrophe in ordinary prose opens a "string" that never closes properly:
 * in `it's password=ab'cd` the quote inside the value is not a delimiter, and
 * cutting the value there would leave `'cd` sitting in supposedly sanitized
 * output. A real closing quote is followed by whitespace, punctuation, or the
 * end of the line.
 *
 * Only single quotes need this test. A double quote is not an apostrophe, so
 * it always closes the string it opened — and requiring punctuation after `"`
 * broke `const value = "password=hunter2".trim();`, where the closing quote is
 * followed by member access.
 */
const SINGLE_QUOTE_REALLY_ENDS_RE = /^(?:[\s,;)}\]|&]|$)/;

function captureValue(
  text: string,
  index: LineIndex,
  valueStart: number,
  options: {
    cliToken?: boolean;
    powerShellAssignment?: boolean;
    dollarsAreLiteral?: boolean;
  } = {},
): RawMatch | null {
  const { dollarsAreLiteral } = options;
  const endOfLineAt = index.lineEnd[valueStart];
  // An unquoted value can never leave the string literal it sits inside.
  const enclosing = enclosingQuote(index, valueStart);
  let endOfLine = endOfLineAt;
  if (enclosing) {
    const close = findClosingQuote(text, valueStart - 1, endOfLineAt, enclosing);
    const closes =
      enclosing === '"' || SINGLE_QUOTE_REALLY_ENDS_RE.test(text.slice(close + 1, close + 2));
    if (close < endOfLineAt && closes) endOfLine = close;
  }
  const quote = text[valueStart];
  if (quote === '"' || quote === "'") {
    const valueEnd = findClosingQuote(text, valueStart, endOfLineAt);
    const value = text.slice(valueStart + 1, valueEnd);
    if (!value || !isLikelySecretValue(value, { quote, dollarsAreLiteral })) return null;
    return { start: valueStart + 1, end: valueEnd, value, confidence: 'medium' };
  }

  // Only the nearest terminator matters, so search a bounded window rather
  // than copying the rest of the line for every match. On a one-line file
  // (minified JSON, a single long log record) the unbounded slice was itself
  // quadratic.
  const windowed = text.slice(valueStart, Math.min(endOfLine, valueStart + TERMINATOR_WINDOW));
  const cast = CAST_BEFORE_LITERAL_RE.exec(windowed);
  if (cast) return captureValue(text, index, valueStart + cast[0].length, options);
  if (options.cliToken) {
    // A CLI value ends at the next space, so judge the token alone. Judging the
    // rest of the line instead read `--password secret --verbose` as a command
    // with a flag and dropped the secret.
    if (/^(?:--?|\/)[A-Za-z]/.test(windowed)) return null;
    const space = windowed.search(/[ \t]/);
    const token = space === -1 ? windowed : windowed.slice(0, space);
    if (!token || looksExecutableValue(token)) return null;
    if (!isLikelySecretValue(token, { dollarsAreLiteral })) return null;
    return { start: valueStart, end: valueStart + token.length, value: token, confidence: 'medium' };
  }
  if (looksExecutableValue(windowed)) return null;

  const adjacentSecretField = GITHUB_TOKEN_BEFORE_ADJACENT_SECRET_FIELD_RE.exec(windowed);
  let terminator = adjacentSecretField?.[0].length ?? findValueTerminator(windowed);
  if (terminator === -1 && valueStart + windowed.length < endOfLine) {
    // Nothing ended the value within the window. Rare enough to pay for the
    // whole line rather than swallow an unrelated field further along it.
    terminator = findValueTerminator(text.slice(valueStart, endOfLine));
  }
  let valueEnd = terminator === -1 ? endOfLine : valueStart + terminator;

  while (valueEnd > valueStart && /[ \t]/.test(text[valueEnd - 1])) valueEnd -= 1;
  const value = text.slice(valueStart, valueEnd);
  if (options.powerShellAssignment) return null;
  if (!value || !isLikelySecretValue(value, { dollarsAreLiteral })) return null;
  return { start: valueStart, end: valueEnd, value, confidence: 'medium' };
}

/**
 * Capture a YAML literal/folded block under a credential key. The block marker
 * and first-line indentation stay in place; the complete body becomes one
 * finding so no later line can survive as a convincing partial redaction.
 */
function captureYamlBlockValue(
  text: string,
  index: LineIndex,
  labelStart: number,
  valueStart: number,
): RawMatch | null {
  const markerEnd = index.lineEnd[valueStart];
  const marker = text.slice(valueStart, markerEnd).trim();
  if (!isYamlBlockMarker(marker)) return null;

  const labelLineStart = index.lineStart[labelStart];
  let parentIndent = 0;
  while (text[labelLineStart + parentIndent] === ' ') parentIndent += 1;

  let cursor = markerEnd;
  let bodyStart = -1;
  let bodyEnd = -1;
  while (cursor < text.length) {
    if (text[cursor] === '\r') cursor += 1;
    if (text[cursor] === '\n') cursor += 1;
    if (cursor >= text.length) break;

    const lineStart = cursor;
    const lineEnd = index.lineEnd[lineStart];
    let indent = 0;
    while (text[lineStart + indent] === ' ') indent += 1;
    const blank = lineStart + indent >= lineEnd;
    if (!blank && indent <= parentIndent) break;
    if (!blank && bodyStart === -1) bodyStart = lineStart + indent;
    if (bodyStart !== -1) bodyEnd = lineEnd;
    cursor = lineEnd;
  }

  if (bodyStart === -1 || bodyEnd < bodyStart) return null;
  const value = text.slice(bodyStart, bodyEnd);
  if (!isLikelySecretValue(value, { dollarsAreLiteral: true })) return null;
  return { start: bodyStart, end: bodyEnd, value, confidence: 'medium' };
}

function isYamlBlockMarker(value: string): boolean {
  return /^[|>](?:[1-9][+-]?|[+-][1-9]?)?$/.test(value.trim());
}

const SSH_PASS_PASSWORD_RE = /\bsshpass\b[^\r\n]{0,200}?[ \t]-p[ \t]+/gi;
const AZ_SERVICE_PRINCIPAL_PASSWORD_RE =
  /\baz[ \t]+login\b(?=[^\r\n]{0,200}--service-principal\b)[^\r\n]{0,200}?[ \t]-p[ \t]+/gi;
const NET_USE_PASSWORD_RE =
  /\bnet[ \t]+use\b[^\r\n]{0,256}?[ \t]\/user:[^\s]+[ \t]+/gi;
/**
 * A credential named in support text: "the temporary password is X", "the
 * current prod password is X", "the secret is X".
 *
 * The qualifier is optional and may repeat, because requiring it to sit
 * directly against the noun missed both "current prod password is" and the
 * bare "the secret is". The noun must be followed immediately by is/was, so
 * "the secret to success is boring verification" never enters this rule.
 */
const TEMP_PASSWORD_PROSE_RE =
  /\b(?:(?:temp(?:orary)?|current|new|old|default|initial|prod(?:uction)?|admin(?:istrator)?|root|master|shared)[ \t]+){0,2}(?:password|passphrase|secret)[ \t]+(?:is|was)[ \t]+/gi;
const INVALID_PASSWORD_PROSE_RE =
  /\b(?:invalid|rejected)[ \t]+(?:password|credential)[ \t]+/gi;
const PROSE_NON_SECRET_VALUE_RE =
  /^(?:unavailable|not[ \t]+available|unknown|expired|incorrect|invalid)[.!?]?$/i;
/** A credential quoted in support text carries a digit or symbol; a word does not. */
const CREDENTIAL_SHAPED_RE = /[0-9!@#$%^&*_=+\\]/;
/**
 * Where a credential named in prose stops. Free text carries no field
 * separator, so the captured value ran to the end of the line and took the
 * rest of the sentence with it: "... is Wint3r2026, please rotate it."
 * A clause break ends the value; a plain space cannot, because
 * "temp password is Spring! 2026" is a single value.
 */
const PROSE_CLAUSE_END_RE = /[,;]\s|\s[-–—]\s/;
/**
 * A following sentence also ends the value: "... is Password123! Also see
 * alice@example.com." Requiring a capital letter after the stop keeps
 * "temp password is Spring! 2026" whole, where the `!` is part of the value.
 */
const PROSE_SENTENCE_END_RE = /[.!?]\s+(?=[A-Z])/;

function proseValueEnd(value: string): number {
  const clause = PROSE_CLAUSE_END_RE.exec(value);
  const sentence = PROSE_SENTENCE_END_RE.exec(value);
  const ends: number[] = [];
  if (clause) ends.push(clause.index);
  // Keep the stop with the value; `!` and `?` are ordinary password characters.
  if (sentence) ends.push(sentence.index + 1);
  return ends.length > 0 ? Math.min(...ends) : value.length;
}

/**
 * Prose gives the value no delimiter, so it runs to the end of the line.
 * Judging that whole run against the non-secret list above almost never
 * matched, and "The new password is required to be 12 characters" lost its
 * remainder to a placeholder. Judge the first token as well: a password quoted
 * in support text looks like a credential, a sentence carrying on does not.
 */
function isProseCredentialValue(value: string): boolean {
  const [first = ''] = value.split(/[ \t]/, 1);
  if (PROSE_NON_SECRET_VALUE_RE.test(value) || PROSE_NON_SECRET_VALUE_RE.test(first)) return false;
  // A bare count continues the sentence: "the password is 12 characters long".
  if (/^\d+[.,;!?]?$/.test(first)) return false;
  return CREDENTIAL_SHAPED_RE.test(first);
}

const GITHUB_TOKEN_BEFORE_ADJACENT_SECRET_FIELD_RE =
  /^gh[pousr]_[A-Za-z0-9]{36}(?=(?:password|passwd|passphrase|secret|token|api[-_.]?key)=)/i;
const ADJACENT_SECRET_FIELD_RE =
  /^(?:password|passwd|passphrase|secret|token|api[-_.]?key)=/i;
const NTLM_HASH_RE =
  /\b(?:ntlm|nt[-_ ]?hash)[ \t]*[:=][ \t]*([0-9a-f]{32})\b/gi;

function detectSecretAssignments(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  const index = buildLineIndex(text);
  const assignmentRe = new RegExp(ASSIGNMENT_LABEL_RE.source, ASSIGNMENT_LABEL_RE.flags);
  let assignment: RegExpExecArray | null;
  while ((assignment = assignmentRe.exec(text)) !== null) {
    if (!isCredentialFieldName(assignment[2])) continue;
    // A `:` separator means a JSON/YAML/JS key rather than a shell or
    // PowerShell assignment, and in those formats `$` is an ordinary
    // character. But the key has to really be one: a quoted key must sit where
    // a structured key can (after `{`, `[`, `,`, `:` or the line start) and a
    // bare key must open its line, allowing indentation and a YAML list
    // marker. Otherwise `echo password: prefix-$PASSWORD` and
    // `echo "password": prefix-$PASSWORD` are read as data and their shell
    // expansions get redacted, corrupting the command.
    const colonKey = assignment[3] === ':';
    const beforeLabel = text.slice(index.lineStart[assignment.index], assignment.index);
    const structuredKey =
      assignment[1] === '"'
        ? /(?:^|[{[,:])[ \t]*$/.test(beforeLabel)
        : /^[ \t]*(?:-[ \t]+)?$/.test(beforeLabel);
    const dollarsAreLiteral = colonKey && structuredKey;
    const valueStart = assignment.index + assignment[0].length;
    const yamlBlock =
      colonKey &&
      structuredKey &&
      isYamlBlockMarker(text.slice(valueStart, index.lineEnd[valueStart]));
    const match = yamlBlock
      ? captureYamlBlockValue(text, index, assignment.index, valueStart)
      : captureValue(text, index, valueStart, {
          powerShellAssignment: hasPowerShellVariablePrefix(text, index, assignment.index),
          dollarsAreLiteral,
        });
    if (match) {
      matches.push(match);
      assignmentRe.lastIndex = Math.max(assignmentRe.lastIndex, match.end);
      if (/^gh[pousr]_[A-Za-z0-9]{36}$/i.test(match.value)) {
        const adjacentField = ADJACENT_SECRET_FIELD_RE.exec(
          text.slice(match.end, index.lineEnd[match.end]),
        );
        if (adjacentField) {
          const adjacentMatch = captureValue(text, index, match.end + adjacentField[0].length);
          if (adjacentMatch) {
            matches.push(adjacentMatch);
            assignmentRe.lastIndex = Math.max(assignmentRe.lastIndex, adjacentMatch.end);
          }
        }
      }
    }
  }

  const cliRe = new RegExp(CLI_SECRET_RE.source, CLI_SECRET_RE.flags);
  let cli: RegExpExecArray | null;
  while ((cli = cliRe.exec(text)) !== null) {
    if (!isCredentialFieldName(cli[1])) continue;
    const match = captureValue(text, index, cli.index + cli[0].length, { cliToken: true });
    if (match) matches.push(match);
  }

  const mysqlRe = new RegExp(MYSQL_INLINE_PASSWORD_RE.source, MYSQL_INLINE_PASSWORD_RE.flags);
  let mysql: RegExpExecArray | null;
  while ((mysql = mysqlRe.exec(text)) !== null) {
    const match = captureValue(text, index, mysql.index + mysql[0].length, { cliToken: true });
    if (match) matches.push(match);
  }

  for (const pattern of [SSH_PASS_PASSWORD_RE, AZ_SERVICE_PRINCIPAL_PASSWORD_RE, NET_USE_PASSWORD_RE]) {
    const commandRe = new RegExp(pattern.source, pattern.flags);
    let command: RegExpExecArray | null;
    while ((command = commandRe.exec(text)) !== null) {
      const match = captureValue(text, index, command.index + command[0].length, { cliToken: true });
      if (match && match.value !== '*') matches.push(match);
    }
  }

  const tempPasswordRe = new RegExp(TEMP_PASSWORD_PROSE_RE.source, TEMP_PASSWORD_PROSE_RE.flags);
  let tempPassword: RegExpExecArray | null;
  while ((tempPassword = tempPasswordRe.exec(text)) !== null) {
    const match = captureValue(text, index, tempPassword.index + tempPassword[0].length);
    if (!match) continue;
    const value = match.value.slice(0, proseValueEnd(match.value));
    if (value && isProseCredentialValue(value)) {
      matches.push({ ...match, end: match.start + value.length, value });
    }
  }

  const invalidPasswordRe = new RegExp(
    INVALID_PASSWORD_PROSE_RE.source,
    INVALID_PASSWORD_PROSE_RE.flags,
  );
  let invalidPassword: RegExpExecArray | null;
  while ((invalidPassword = invalidPasswordRe.exec(text)) !== null) {
    const match = captureValue(text, index, invalidPassword.index + invalidPassword[0].length, {
      cliToken: true,
    });
    if (match && CREDENTIAL_SHAPED_RE.test(match.value)) matches.push(match);
  }

  const xmlRe = new RegExp(XML_SECRET_RE.source, XML_SECRET_RE.flags);
  let xml: RegExpExecArray | null;
  while ((xml = xmlRe.exec(text)) !== null) {
    if (!isCredentialFieldName(xml[1])) continue;
    const value = xml[2].trim();
    if (!value || !isLikelySecretValue(value, { quote: "'" })) continue;
    const relativeStart = xml[0].indexOf(xml[2]) + xml[2].indexOf(value);
    const start = xml.index + relativeStart;
    matches.push({ start, end: start + value.length, value, confidence: 'medium' });
  }

  const tagRe = new RegExp(XML_TAG_RE.source, XML_TAG_RE.flags);
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(text)) !== null) {
    const keyAttributeRe = new RegExp(
      String.raw`\b(?:key|name)[ \t]*=[ \t]*(["'])(${SECRET_KEY_PATTERN})\1`,
      'i',
    );
    const keyAttribute = keyAttributeRe.exec(tag[0]);
    if (!keyAttribute || !isCredentialFieldName(keyAttribute[2])) continue;
    const valueAttribute = /\bvalue[ \t]*=[ \t]*(["'])([^"']+)\1/i.exec(tag[0]);
    if (!valueAttribute || !isLikelySecretValue(valueAttribute[2], { quote: "'" })) continue;
    const value = valueAttribute[2];
    const relativeStart = valueAttribute.index + valueAttribute[0].indexOf(value);
    const start = tag.index + relativeStart;
    matches.push({ start, end: start + value.length, value, confidence: 'medium' });
  }

  matches.push(
    ...regexMatches(text, NTLM_HASH_RE, {
      group: 1,
      confidenceFor: () => 'high',
    }),
  );

  return matches;
}

export const secretAssignmentDetector: Detector = {
  id: 'secret-assignment',
  name: 'Password / secret assignment',
  category: 'secrets',
  severity: 'high',
  label: 'SECRET',
  priority: 80,
  explanation: 'A literal assigned to a password/secret-style key is treated as a credential.',
  detect: detectSecretAssignments,
};
