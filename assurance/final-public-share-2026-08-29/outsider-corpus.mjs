/*
 * Frozen blind outsider corpus for the 2026-08-29 final public-share campaign.
 *
 * This file was authored before inspecting detector implementation, detector
 * regression tests, or earlier adversarial corpora. All values are synthetic.
 * Credential-shaped strings are assembled at runtime to avoid publishing
 * scanner-triggering literals in the repository.
 */

const cases = [];

function redact(id, group, input, forbiddenOutput, expectedFindingClass, options = {}) {
  cases.push({
    id,
    group,
    input,
    profile: options.profile ?? "Balanced",
    outputMode: options.outputMode ?? "Safe-share",
    expectation: "redact",
    forbiddenOutput: Array.isArray(forbiddenOutput) ? forbiddenOutput : [forbiddenOutput],
    requiredOutput: options.requiredOutput ?? [],
    minimumFindings: options.minimumFindings ?? (Array.isArray(forbiddenOutput) ? forbiddenOutput.length : 1),
    expectedFindingClass,
    notes: options.notes ?? "",
  });
}

function preserve(id, group, input, options = {}) {
  cases.push({
    id,
    group,
    input,
    profile: options.profile ?? "Balanced",
    outputMode: options.outputMode ?? "Safe-share",
    expectation: "preserve",
    forbiddenOutput: [],
    requiredOutput: options.requiredOutput ?? [input],
    minimumFindings: 0,
    maximumFindings: options.maximumFindings ?? 0,
    expectedFindingClass: "none",
    notes: options.notes ?? "A finding that rewrites this value is a damaging false positive.",
  });
}

const join = (...parts) => parts.join("");
const awsLong = join("AKIA", "ABCDEFGHIJKLMNOP");
const awsTemp = join("ASIA", "ZYXWVUTSRQPONMLK");
const githubClassic = join("ghp_", "A".repeat(36));
const githubOauth = join("gho_", "b".repeat(36));
const githubServer = join("ghs_", "C".repeat(36));
const githubPat = join("github_pat_", "11", "A".repeat(22), "_", "b".repeat(59));
const gitlabPat = join("glpat-", "aB3dE5fG7hJ9kL2mN4pQ");
const slackBot = join("xoxb-", "123456789012-1234567890123-", "A".repeat(24));
const slackUser = join("xoxp-", "123456789012-123456789012-123456789012-", "b".repeat(32));
const stripeLive = join("sk_live_", "A1".repeat(12));
const stripeRestricted = join("rk_live_", "B2".repeat(12));
const googleApi = join("AIza", "A".repeat(35));
const twilio = join("SK", "0123456789abcdef".repeat(2));
const sendgrid = join("SG.", "A".repeat(22), ".", "b".repeat(43));
const npmToken = join("npm_", "C".repeat(36));
const pypiToken = join("pypi-", "AgEIcHlwaS5vcmcCJG", "D".repeat(50));
const datadog = join("ddapi_", "e".repeat(32));
const shopify = join("shpat_", "f".repeat(32));
const mailgun = join("key-", "0123456789abcdef0123456789abcdef");
const jwt = join("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.", "eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluIn0.", "abcDEF123_-abcDEF123_-abcDEF123_-");
const discord = join("MTIzNDU2Nzg5MDEyMzQ1Njc4.", "AbCdEf.", "a".repeat(27));
const digitalOcean = join("dop_v1_", "1a2b3c4d5e6f".repeat(5), "1a2b");
const telegram = join("123456789:", "AA", "b".repeat(33));
const square = join("sq0atp-", "A".repeat(22));
const linear = join("lin_api_", "b".repeat(40));
const huggingFace = join("hf_", "C".repeat(34));
const openAi = join("sk-proj-", "D".repeat(48));
const anthropic = join("sk-ant-api03-", "E".repeat(48));
const azureSas = "sv=2023-11-03&se=2030-01-01T00%3A00%3A00Z&sr=b&sp=rw&sig=AbCdEf0123456789%2BxyZ%3D";
const pemBody = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSj";
const slackWebhook = join(
  "https://hooks.slack.com/",
  "services/",
  "T00000000/",
  "B00000000/",
  "X".repeat(24),
);

// .env / JSON / YAML / XML / INI
redact("CFG-001", "config", 'DATABASE_PASSWORD="h0rse!$\\\" q9"', 'h0rse!$\\\" q9', "password", { requiredOutput: ["DATABASE_PASSWORD="] });
redact("CFG-002", "config", "PASSWORD='pa$$ word!#'", "pa$$ word!#", "password", { requiredOutput: ["PASSWORD="] });
redact("CFG-003", "config", "API_SECRET=unquoted-Secret_42!", "unquoted-Secret_42!", "secret", { requiredOutput: ["API_SECRET="] });
redact("CFG-004", "config", "TOKEN = tok.value/with+punctuation==", "tok.value/with+punctuation==", "token", { requiredOutput: ["TOKEN"] });
redact("CFG-005", "config", "DB_USER=appsvc\nDB_PASS=s3cr3t-pass", ["appsvc", "s3cr3t-pass"], "username and password", { requiredOutput: ["DB_USER=", "DB_PASS="] });
redact("CFG-006", "config", '{"username":"buildbot","password":"m0on!light"}', ["buildbot", "m0on!light"], "username and password", { requiredOutput: ['"username"', '"password"'] });
redact("CFG-007", "config", '{ "clientSecret" : "qU0te\\\"esc\\\\ape$" }', 'qU0te\\\"esc\\\\ape$', "secret", { requiredOutput: ["clientSecret"] });
redact("CFG-008", "config", '{"access_token":"' + githubClassic + '","enabled":true}', githubClassic, "provider token", { requiredOutput: ['"enabled":true'] });
redact("CFG-009", "config", "database:\n  user: deploysvc\n  password: 'r@in y-day'", ["deploysvc", "r@in y-day"], "username and password", { requiredOutput: ["database:", "password:"] });
redact("CFG-010", "config", "auth: { user: apiworker, pass: s!mple#value }", ["apiworker", "s!mple#value"], "username and password");
redact("CFG-011", "config", '<credentials username="svc-demo" password="Tide&moon42!" />', ["svc-demo", "Tide&moon42!"], "username and password", { requiredOutput: ["<credentials", "/>" ] });
redact("CFG-012", "config", "<apiKey>local-demo-key-7788</apiKey>", "local-demo-key-7788", "secret", { requiredOutput: ["<apiKey>", "</apiKey>"] });
redact("CFG-013", "config", "[database]\nusername=reportsvc\npassword=Chartreuse!88", ["reportsvc", "Chartreuse!88"], "username and password", { requiredOutput: ["[database]"] });
redact("CFG-014", "config", "redis.password : cache secret 99", "cache secret 99", "password", { requiredOutput: ["redis.password"] });
redact("CFG-015", "config", "secret_key: |\n  line-one!\n  line-two$", ["line-one!", "line-two$"], "multiline secret", { minimumFindings: 1, notes: "Neither secret line may remain exposed." });
redact("CFG-016", "config", "PWD=abc123\r\nHOST=dev-db-01.internal.example", ["abc123", "dev-db-01.internal.example"], "password and hostname", { requiredOutput: ["PWD=", "HOST="] });
redact("CFG-017", "config", "proxy=http://proxyuser:pr0xy!pass@proxy.lab.example:8080", ["proxyuser", "pr0xy!pass", "proxy.lab.example"], "connection URL credentials and hostname", { minimumFindings: 2, requiredOutput: ["proxy=http://", ":8080"] });
redact("CFG-018", "config", "SENTRY_DSN=https://abc123def456@example.ingest.sentry.io/12345", "abc123def456", "credential in DSN", { requiredOutput: ["SENTRY_DSN="] });

// PowerShell / Bash / CMD
redact("SH-001", "shell", '$pw = ConvertTo-SecureString "C0mpl3x!$ value" -AsPlainText -Force', "C0mpl3x!$ value", "password", { requiredOutput: ["ConvertTo-SecureString", "-AsPlainText", "-Force"] });
redact("SH-002", "shell", "$cred = New-Object pscredential('LAB\\deploysvc',(ConvertTo-SecureString 'D3mo!pass' -AsPlainText -Force))", ["LAB\\deploysvc", "D3mo!pass"], "username and password", { minimumFindings: 2 });
redact("SH-003", "shell", "$env:API_TOKEN = '" + githubOauth + "'", githubOauth, "provider token", { requiredOutput: ["$env:API_TOKEN"] });
redact("SH-004", "shell", "Invoke-RestMethod -Headers @{ Authorization = 'Bearer " + jwt + "' } -Uri https://api.example.test", jwt, "bearer token", { requiredOutput: ["Invoke-RestMethod", "Authorization", "-Uri"] });
redact("SH-005", "shell", "net use \\\\filesrv-22.corp.example\\share /user:CORP\\alex.d Demo!4455", ["filesrv-22.corp.example", "CORP\\alex.d", "Demo!4455"], "UNC host, username and password", { minimumFindings: 3, requiredOutput: ["net use", "\\share"] });
redact("SH-006", "shell", "cmdkey /add:server22 /user:backupsvc /pass:Blue-Sky_77", ["server22", "backupsvc", "Blue-Sky_77"], "host, username and password", { minimumFindings: 2, requiredOutput: ["cmdkey", "/add:", "/user:", "/pass:"] });
redact("SH-007", "shell", "export DB_PASSWORD='sp ace$and!bang'", "sp ace$and!bang", "password", { requiredOutput: ["export DB_PASSWORD="] });
redact("SH-008", "shell", "curl -u apiuser:p@ss:w0rd https://service.internal.example/v1", ["apiuser", "p@ss:w0rd", "service.internal.example"], "basic-auth credentials and hostname", { minimumFindings: 2, requiredOutput: ["curl -u", "/v1"] });
redact("SH-009", "shell", "curl -H \"Authorization: Bearer " + openAi + "\" https://api.openai.com/v1/models", openAi, "provider token", { requiredOutput: ["Authorization: Bearer", "https://api.openai.com/v1/models"] });
redact("SH-010", "shell", "MYSQL_PWD=sea-shell!9 mysql -h db01.private.example -u root", ["sea-shell!9", "db01.private.example", "root"], "password, hostname and username", { minimumFindings: 2 });
redact("SH-011", "shell", "set PASSWORD=Window$ Pass! 9", "Window$ Pass! 9", "password", { requiredOutput: ["set PASSWORD="] });
redact("SH-012", "shell", "set AWS_ACCESS_KEY_ID=" + awsLong, awsLong, "AWS access key ID", { requiredOutput: ["set AWS_ACCESS_KEY_ID="] });
redact("SH-013", "shell", "sshpass -p 'demo ssh pass' ssh ops@10.24.8.19", ["demo ssh pass", "ops", "10.24.8.19"], "password, username and IP", { minimumFindings: 2, requiredOutput: ["sshpass", "ssh"] });
redact("SH-014", "shell", "az login --service-principal -u 11111111-2222-4333-8444-555555555555 -p TenantSecret!42 --tenant aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", ["11111111-2222-4333-8444-555555555555", "TenantSecret!42", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"], "cloud identifiers and secret", { minimumFindings: 3, requiredOutput: ["az login", "--service-principal"] });

// Python / JavaScript / TypeScript
redact("CODE-001", "code", 'password = "Django! secret 5"', "Django! secret 5", "password", { requiredOutput: ["password ="] });
redact("CODE-002", "code", "requests.get(url, auth=('agentuser', 'r3quest$pass'))", ["agentuser", "r3quest$pass"], "username and password", { requiredOutput: ["requests.get", "auth="] });
redact("CODE-003", "code", "headers = {'Authorization': 'Bearer " + jwt + "'}", jwt, "bearer token", { requiredOutput: ["headers", "Authorization"] });
redact("CODE-004", "code", "client = MongoClient('mongodb://reader:Read!Only@mongo-01.internal:27017/app')", ["reader", "Read!Only", "mongo-01.internal"], "connection credentials and hostname", { minimumFindings: 2, requiredOutput: ["MongoClient", ":27017/app"] });
redact("CODE-005", "code", "const token = '" + githubServer + "';", githubServer, "provider token", { requiredOutput: ["const token =", ";"] });
redact("CODE-006", "code", "fetch('/api', { headers: { 'X-API-Key': 'front-end-demo-key-9981' } });", "front-end-demo-key-9981", "API key", { requiredOutput: ["fetch('/api'", "X-API-Key"] });
redact("CODE-007", "code", "process.env.DATABASE_URL ||= 'postgres://ciuser:ci!pass@db-ci.internal:5432/build';", ["ciuser", "ci!pass", "db-ci.internal"], "connection credentials and hostname", { minimumFindings: 2, requiredOutput: ["process.env.DATABASE_URL", ":5432/build"] });
redact("CODE-008", "code", "new Client({ accountSid: 'AC" + "a".repeat(32) + "', authToken: '" + twilio + "' })", twilio, "provider credential", { requiredOutput: ["new Client", "accountSid", "authToken"] });
redact("CODE-009", "code", "const basic = Buffer.from('svc-ci:P!pe|line 7').toString('base64');", ["svc-ci", "P!pe|line 7"], "username and password", { minimumFindings: 2, requiredOutput: ["Buffer.from", ".toString('base64')"] });
redact("CODE-010", "code", "axios.defaults.headers.common.Authorization = `Bearer " + anthropic + "`;", anthropic, "provider token", { requiredOutput: ["axios.defaults", "Authorization"] });

// Logs / tickets / stack traces / dumps
redact("LOG-001", "logs", "2026-08-29T09:14:22Z login failed user=casey.w password=Wrong!Pass44 source=10.20.30.41", ["casey.w", "Wrong!Pass44", "10.20.30.41"], "username, password and IP", { minimumFindings: 3, requiredOutput: ["login failed", "source="] });
redact("LOG-002", "logs", "Authorization: Basic c3ZjLWRlbW86U3VwcG9ydCE3Nw==", "c3ZjLWRlbW86U3VwcG9ydCE3Nw==", "basic authorization credential", { requiredOutput: ["Authorization: Basic"] });
redact("LOG-003", "logs", "Request headers: x-api-key=incident-demo-key-0009; user-agent=curl/8.6", "incident-demo-key-0009", "API key", { requiredOutput: ["Request headers:", "user-agent=curl/8.6"] });
redact("LOG-004", "logs", "System.Data.SqlClient.SqlException connecting to Server=db-prd-07.corp.example;User Id=reporter;Password=Report!55;", ["db-prd-07.corp.example", "reporter", "Report!55"], "connection credentials and hostname", { minimumFindings: 3, requiredOutput: ["System.Data.SqlClient.SqlException", "Server=", "User Id=", "Password="] });
redact("LOG-005", "logs", "File not found: C:\\Users\\demo.user\\AppData\\Local\\CloakLab\\settings.json", "C:\\Users\\demo.user\\AppData\\Local\\CloakLab\\settings.json", "Windows path", { requiredOutput: ["File not found:"] });
redact("LOG-006", "logs", "at loadConfig (/home/demo-user/projects/support-app/src/config.js:42:11)", "/home/demo-user/projects/support-app/src/config.js", "Linux path", { requiredOutput: ["at loadConfig", ":42:11"] });
redact("LOG-007", "logs", "Ticket: Please reset the demo account. Login is NORTH\\jamie.k and temp password is Spring! 2026", ["NORTH\\jamie.k", "Spring! 2026"], "username and password", { minimumFindings: 2, requiredOutput: ["Ticket: Please reset the demo account."] });
redact("LOG-008", "logs", "Webhook delivery failed: " + slackWebhook, slackWebhook, "provider webhook", { requiredOutput: ["Webhook delivery failed:"] });
redact("LOG-009", "logs", "smtp auth rejected host=mail.private.example username=notifier@example.test password='M@il pass!'", ["mail.private.example", "notifier@example.test", "M@il pass!"], "hostname, email/username and password", { minimumFindings: 3 });
redact("LOG-010", "logs", "DEBUG config={token:" + npmToken + ", cacheDir:D:\\Build Agent\\cache}", [npmToken, "D:\\Build Agent\\cache"], "provider token and Windows path", { minimumFindings: 2, requiredOutput: ["DEBUG config="] });
redact("LOG-011", "logs", "Caused by: redis.clients.AuthenticationError: invalid password red!s-pass at redis01.lab:6379", ["red!s-pass", "redis01.lab"], "password and hostname", { minimumFindings: 2, requiredOutput: ["AuthenticationError", ":6379"] });
redact("LOG-012", "logs", "Support dump\r\nUSERDOMAIN=DEMO\r\nUSERNAME=taylor.r\r\nCOMPUTERNAME=WS-4821\r\nUSERPROFILE=C:\\Users\\taylor.r", ["taylor.r", "WS-4821", "C:\\Users\\taylor.r"], "username, host and path", { minimumFindings: 3, requiredOutput: ["Support dump"] });

// Provider credentials and boundary characters
redact("PROV-001", "providers", "aws_access_key_id=" + awsLong, awsLong, "AWS access key ID");
redact("PROV-002", "providers", "key=(" + awsTemp + ")", awsTemp, "AWS temporary access key ID", { requiredOutput: ["key=()"] });
redact("PROV-003", "providers", "token[" + githubClassic + "]", githubClassic, "GitHub token", { requiredOutput: ["token["] });
redact("PROV-004", "providers", "oauth=\"" + githubOauth + "\",", githubOauth, "GitHub token", { requiredOutput: ["oauth="] });
redact("PROV-005", "providers", "server-token:" + githubServer + ";", githubServer, "GitHub token");
redact("PROV-006", "providers", "pat='" + githubPat + "'", githubPat, "GitHub fine-grained PAT");
redact("PROV-007", "providers", "PRIVATE-TOKEN: " + gitlabPat, gitlabPat, "GitLab token");
redact("PROV-008", "providers", "SLACK_BOT_TOKEN=" + slackBot, slackBot, "Slack token");
redact("PROV-009", "providers", "slack_user_token: " + slackUser, slackUser, "Slack token");
redact("PROV-010", "providers", "stripe=" + stripeLive, stripeLive, "Stripe secret key");
redact("PROV-011", "providers", "restricted_key='" + stripeRestricted + "'", stripeRestricted, "Stripe restricted key");
redact("PROV-012", "providers", "googleApiKey: " + googleApi, googleApi, "Google API key");
redact("PROV-013", "providers", "TWILIO_AUTH_TOKEN=" + twilio, twilio, "Twilio credential");
redact("PROV-014", "providers", "Authorization: Bearer " + sendgrid, sendgrid, "SendGrid API key");
redact("PROV-015", "providers", "//registry.npmjs.org/:_authToken=" + npmToken, npmToken, "npm token");
redact("PROV-016", "providers", "password = " + pypiToken, pypiToken, "PyPI token");
redact("PROV-017", "providers", "DD_API_KEY=" + datadog, datadog, "Datadog API key");
redact("PROV-018", "providers", "SHOPIFY_ACCESS_TOKEN=" + shopify, shopify, "Shopify token");
redact("PROV-019", "providers", "MAILGUN_API_KEY=" + mailgun, mailgun, "Mailgun key");
redact("PROV-020", "providers", "Authorization: Bearer " + jwt, jwt, "JWT");
redact("PROV-021", "providers", "DISCORD_TOKEN=" + discord, discord, "Discord bot token");
redact("PROV-022", "providers", "DIGITALOCEAN_TOKEN=" + digitalOcean, digitalOcean, "DigitalOcean token");
redact("PROV-023", "providers", "TELEGRAM_BOT_TOKEN=" + telegram, telegram, "Telegram bot token");
redact("PROV-024", "providers", "SQUARE_ACCESS_TOKEN=" + square, square, "Square token");
redact("PROV-025", "providers", "LINEAR_API_KEY=" + linear, linear, "Linear API key");
redact("PROV-026", "providers", "HF_TOKEN=" + huggingFace, huggingFace, "Hugging Face token");
redact("PROV-027", "providers", "OPENAI_API_KEY=" + openAi, openAi, "OpenAI API key");
redact("PROV-028", "providers", "ANTHROPIC_API_KEY=" + anthropic, anthropic, "Anthropic API key");
redact("PROV-029", "providers", "url=https://storage.example.test/file?" + azureSas, azureSas, "signed URL credential", { requiredOutput: ["url=https://storage.example.test/file?"] });
redact("PROV-030", "providers", "hook=https://api.telegram.org/bot" + telegram + "/sendMessage", telegram, "Telegram bot token", { requiredOutput: ["hook=https://api.telegram.org/bot", "/sendMessage"] });

// Connection strings
redact("CONN-001", "connections", "Server=tcp:sql-prod-01.database.windows.net,1433;Initial Catalog=Billing;User ID=sqladmin;Password=P@ss;word=42;Encrypt=True;", ["sql-prod-01.database.windows.net", "sqladmin", "P@ss;word=42"], "SQL connection credentials and host", { minimumFindings: 3, requiredOutput: ["Initial Catalog=Billing", "Encrypt=True"] });
redact("CONN-002", "connections", "postgresql://etl_user:etl%20pass%21@pg.internal.example:5432/warehouse?sslmode=require", ["etl_user", "etl%20pass%21", "pg.internal.example"], "Postgres URL credentials and host", { minimumFindings: 2, requiredOutput: [":5432/warehouse?sslmode=require"] });
redact("CONN-003", "connections", "mongodb+srv://app-user:Mongo!pass@cluster0.example.mongodb.net/app", ["app-user", "Mongo!pass", "cluster0.example.mongodb.net"], "MongoDB URL credentials and host", { minimumFindings: 2, requiredOutput: ["mongodb+srv://", "/app"] });
redact("CONN-004", "connections", "redis://:Cache$Secret@10.2.3.4:6379/0", ["Cache$Secret", "10.2.3.4"], "Redis password and IP", { minimumFindings: 2, requiredOutput: ["redis://", ":6379/0"] });
redact("CONN-005", "connections", "amqps://queueuser:Rabbit!77@mq.private.example:5671/vhost", ["queueuser", "Rabbit!77", "mq.private.example"], "AMQP credentials and host", { minimumFindings: 2, requiredOutput: ["amqps://", ":5671/vhost"] });
redact("CONN-006", "connections", "Endpoint=sb://demo-bus.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/=", ["demo-bus.servicebus.windows.net", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/="], "service bus host and shared key", { minimumFindings: 2, requiredOutput: ["SharedAccessKeyName=RootManageSharedAccessKey"] });
redact("CONN-007", "connections", "DefaultEndpointsProtocol=https;AccountName=demostore;AccountKey=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+/==;EndpointSuffix=core.windows.net", ["demostore", "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+/=="], "storage account and key", { minimumFindings: 2, requiredOutput: ["DefaultEndpointsProtocol=https", "EndpointSuffix=core.windows.net"] });
redact("CONN-008", "connections", "Host=mail.private.example;Port=587;Username=alerts@example.test;Password=Mail!Pass 88;TLS=true", ["mail.private.example", "alerts@example.test", "Mail!Pass 88"], "SMTP host, username and password", { minimumFindings: 3, requiredOutput: ["Port=587", "TLS=true"] });

// Private keys and hashes
redact("CRYPTO-001", "crypto", "-----BEGIN PRIVATE KEY-----\n" + pemBody + "\n-----END PRIVATE KEY-----", pemBody, "private key", { requiredOutput: ["BEGIN PRIVATE KEY", "END PRIVATE KEY"] });
redact("CRYPTO-002", "crypto", "-----BEGIN RSA PRIVATE KEY-----\r\n" + pemBody + "AA==\r\n-----END RSA PRIVATE KEY-----", pemBody + "AA==", "RSA private key", { requiredOutput: ["BEGIN RSA PRIVATE KEY", "END RSA PRIVATE KEY"] });
redact("CRYPTO-003", "crypto", "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC7demopublicmaterial user@demo", "AAAAB3NzaC1yc2EAAAADAQABAAABAQC7demopublicmaterial", "SSH key material", { requiredOutput: ["ssh-rsa"] });
redact("CRYPTO-004", "crypto", "password_hash=$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012", "$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012", "password hash", { requiredOutput: ["password_hash="] });
redact("CRYPTO-005", "crypto", "ntlm=8846F7EAEE8FB117AD06BDD830B7586C", "8846F7EAEE8FB117AD06BDD830B7586C", "credential hash", { requiredOutput: ["ntlm="] });
redact("CRYPTO-006", "crypto", "sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "hash", { requiredOutput: ["sha256:"] });

// Supported identifiers
redact("ID-001", "identifiers", "Contact dev.user@example.test for access.", "dev.user@example.test", "email", { profile: "Maximum", requiredOutput: ["Contact", "for access."] });
redact("ID-002", "identifiers", "Source address 192.168.44.27 reached 10.0.0.8.", ["192.168.44.27", "10.0.0.8"], "IPv4 addresses", { minimumFindings: 2 });
redact("ID-003", "identifiers", "IPv6 peer 2001:db8:85a3::8a2e:370:7334 disconnected.", "2001:db8:85a3::8a2e:370:7334", "IPv6 address", { requiredOutput: ["IPv6 peer", "disconnected."] });
redact("ID-004", "identifiers", "UNC=\\\\fs-prod-14.corp.example\\Finance\\2026\\close.xlsx", "\\\\fs-prod-14.corp.example\\Finance\\2026\\close.xlsx", "UNC path", { requiredOutput: ["UNC="] });
redact("ID-005", "identifiers", "Path: C:\\ProgramData\\ContosoDemo\\Agent\\agent.log", "C:\\ProgramData\\ContosoDemo\\Agent\\agent.log", "Windows path", { requiredOutput: ["Path:"] });
redact("ID-006", "identifiers", "Config at /etc/cloak-demo/private/config.yaml", "/etc/cloak-demo/private/config.yaml", "Linux path", { requiredOutput: ["Config at"] });
redact("ID-007", "identifiers", "Host app-01.eu-west.internal.example failed health check.", "app-01.eu-west.internal.example", "hostname", { requiredOutput: ["Host", "failed health check."] });
redact("ID-008", "identifiers", "DOMAIN\\sam.account opened the ticket.", "DOMAIN\\sam.account", "domain username", { requiredOutput: ["opened the ticket."] });
redact("ID-009", "identifiers", "UPN: sam.account@example.test", "sam.account@example.test", "UPN/email", { profile: "Maximum", requiredOutput: ["UPN:"] });
redact("ID-010", "identifiers", "Tenant ID: 12345678-1234-4abc-8def-1234567890ab", "12345678-1234-4abc-8def-1234567890ab", "cloud tenant identifier", { requiredOutput: ["Tenant ID:"] });
redact("ID-011", "identifiers", "SubscriptionId=87654321-4321-4cba-9fed-ba0987654321", "87654321-4321-4cba-9fed-ba0987654321", "cloud subscription identifier", { requiredOutput: ["SubscriptionId="] });
redact("ID-012", "identifiers", "MAC 00:1A:2B:3C:4D:5E on switch port 18", "00:1A:2B:3C:4D:5E", "MAC address", { requiredOutput: ["on switch port 18"] });

// Multiple secrets, adjacency, and overlap
redact("MULTI-001", "multiple", "user=alpha pass=One!1 token=" + githubClassic, ["alpha", "One!1", githubClassic], "username, password and provider token", { minimumFindings: 3, requiredOutput: ["user=", "pass=", "token="] });
redact("MULTI-002", "multiple", "Authorization:Bearer " + jwt + ";X-API-Key:second-demo-key", [jwt, "second-demo-key"], "bearer token and API key", { minimumFindings: 2, requiredOutput: ["Authorization:Bearer", "X-API-Key:"] });
redact("MULTI-003", "multiple", "postgres://svc:Pass!9@10.8.7.6:5432/db", ["svc", "Pass!9", "10.8.7.6"], "connection credentials and IP", { minimumFindings: 3, requiredOutput: ["postgres://", ":5432/db"] });
redact("MULTI-004", "multiple", "path=C:\\Users\\alex\\secret.txt password=alexSecret!", ["C:\\Users\\alex\\secret.txt", "alexSecret!"], "path and password", { minimumFindings: 2, requiredOutput: ["path=", "password="] });
redact("MULTI-005", "multiple", "(" + githubClassic + ")," + awsLong + ";" + stripeLive, [githubClassic, awsLong, stripeLive], "three provider credentials", { minimumFindings: 3, requiredOutput: ["(", "),", ";"] });
redact("MULTI-006", "multiple", "password='left\\'quote' next_token='edge$token!'", ["left\\'quote", "edge$token!"], "escaped-quote password and token", { minimumFindings: 2, requiredOutput: ["password=", "next_token="] });
redact("MULTI-007", "multiple", "\uFEFFAPI_KEY=unicode-demo-secret\r\nHOST=résumé-dev.internal.example\r\n", ["unicode-demo-secret", "résumé-dev.internal.example"], "secret and Unicode hostname", { minimumFindings: 2, requiredOutput: ["API_KEY=", "HOST="] });
redact("MULTI-008", "multiple", "token=" + githubClassic + "password=NoDelimiter!7", [githubClassic, "NoDelimiter!7"], "adjacent token and password", { minimumFindings: 2, notes: "Boundary handling must not leak either adjacent value." });

// Benign values, placeholders, templates, examples, and provider near misses
preserve("SAFE-001", "benign", "PASSWORD=${PASSWORD}");
preserve("SAFE-002", "benign", "password = process.env.PASSWORD");
preserve("SAFE-003", "benign", "password: {{ vault_password }}");
preserve("SAFE-004", "benign", "API_KEY=<YOUR_API_KEY>");
preserve("SAFE-005", "benign", "TOKEN=changeme");
preserve("SAFE-006", "benign", "const password = generatePassword();");
preserve("SAFE-007", "benign", "$Password = Read-Host -AsSecureString");
preserve("SAFE-008", "benign", "ConvertTo-SecureString $env:PASSWORD -AsPlainText -Force");
preserve("SAFE-009", "benign", "regex = '(?i)password\\s*=\\s*.+$'");
preserve("SAFE-010", "benign", "example.com and 203.0.113.10 are documentation values");
preserve("SAFE-011", "benign", "version=10.20.30.40");
preserve("SAFE-012", "benign", "sha256=<64-hex-characters>");
preserve("SAFE-013", "near-miss", join("ghp_", "A".repeat(35)));
preserve("SAFE-014", "near-miss", join("ghp_", "A".repeat(37)));
preserve("SAFE-015", "near-miss", join("AKIA", "A".repeat(15)));
preserve("SAFE-016", "near-miss", join("AKIA", "A".repeat(17)));
preserve("SAFE-017", "near-miss", join("sk_live_", "short"));
preserve("SAFE-018", "near-miss", join("AIza", "A".repeat(34)));
preserve("SAFE-019", "near-miss", join("xoxb-", "not-a-real-token"));
preserve("SAFE-020", "near-miss", "eyJhbGciOiJIUzI1NiJ9.only-two-segments");
preserve("SAFE-021", "benign", "Authorization: Bearer ${ACCESS_TOKEN}");
preserve("SAFE-022", "benign", "jdbc:postgresql://localhost:5432/demo");
preserve("SAFE-023", "benign", "https://user:password@example.com is documentation syntax");
preserve("SAFE-024", "benign", "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----");
preserve("SAFE-025", "benign", "function Get-PasswordPolicy { param($UserName) }");
preserve("SAFE-026", "benign", "$Credential = Get-Credential");
preserve("SAFE-027", "benign", "User ID must be supplied at runtime.");
preserve("SAFE-028", "benign", "The secret to success is boring verification.");
preserve("SAFE-029", "benign", "client_secret = config.get('client_secret')");
preserve("SAFE-030", "benign", "token_count=4096; password_length=20");

if (cases.length < 120 || cases.length > 180) {
  throw new Error(`Frozen corpus size ${cases.length} is outside the required 120-180 range.`);
}

for (const testCase of cases) {
  Object.freeze(testCase.expectation);
  Object.freeze(testCase);
}

export default Object.freeze(cases);
