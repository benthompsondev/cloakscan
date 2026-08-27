import { describe, expect, it } from 'vitest';
import { buildCleanText } from '../sanitize';
import { scanText } from '../scan';
import { secretAssignmentDetector } from './secrets';

const values = (text: string) => secretAssignmentDetector.detect(text).map((match) => match.value);

describe('contextual secret assignments', () => {
  it('redacts the credential values from the reported public failure', () => {
    const source = 'User=Admin Password=password Api_key=A1cdeFgh795=';

    expect(buildCleanText(source, scanText(source))).toBe(
      'User=[USERNAME_1] Password=[SECRET_1] Api_key=[SECRET_2]',
    );
  });

  it.each([
    ['environment password', 'PASSWORD=password', ['password']],
    ['environment API key', 'API_KEY=A1cdeFgh795=', ['A1cdeFgh795=']],
    ['YAML password', 'password: password', ['password']],
    ['YAML API key', 'api_key: A1cdeFgh795=', ['A1cdeFgh795=']],
    ['JSON password', '{"password":"password"}', ['password']],
    ['JSON API key', '{"api_key":"A1cdeFgh795="}', ['A1cdeFgh795=']],
    ['PowerShell quoted literal', "$Password = 'password'", ['password']],
    ['PowerShell scoped quoted literal', '$script:Password = "password"', ['password']],
    ['compound client secret', 'client_secret=demoSecret123', ['demoSecret123']],
    ['provider-prefixed API key name', 'OPENAI_API_KEY=demoKey123', ['demoKey123']],
    ['provider-prefixed token name', 'github_token=abc123def456', ['abc123def456']],
    ['generic access token', 'access_token=abc123def456', ['abc123def456']],
    ['query-string access token', 'https://example.test/?access_token=abc123&view=summary', ['abc123']],
    ['symbol-leading password', 'password=*abc123', ['*abc123']],
    ['at-sign-leading password', 'password=@abc123', ['@abc123']],
    ['bracketed password', 'password=[abc123]', ['[abc123]']],
    ['braced password', 'password={abc123}', ['{abc123}']],
    ['ampersand-leading password', 'password=&abc123', ['&abc123']],
    ['quoted parenthesized password', 'password="(abc123)"', ['(abc123)']],
    ['single-quoted dollar password', "password='$literal-value'", ['$literal-value']],
    ['XML password element', '<password>password</password>', ['password']],
    ['XML key/value element', '<add key="password" value="demoSecret123" />', ['demoSecret123']],
    ['XML secret attribute', '<service api-key="demoKey123" />', ['demoKey123']],
    ['CLI password argument', '--password password', ['password']],
  ])('finds an unquoted literal in %s syntax', (_name, source, expected) => {
    expect(values(source)).toEqual(expected);
  });

  it('preserves quotes and surrounding structure', () => {
    const source = '{"password":"password","api_key":"A1cdeFgh795="}';

    expect(buildCleanText(source, scanText(source))).toBe(
      '{"password":"[SECRET_1]","api_key":"[SECRET_2]"}',
    );
  });

  it('captures escaped quotes without truncating the secret value', () => {
    const source = '{"password":"pa\\"ss","api_key":"A1cdeFgh795="}';

    expect(buildCleanText(source, scanText(source))).toBe(
      '{"password":"[SECRET_1]","api_key":"[SECRET_2]"}',
    );
  });

  it.each([
    ['semicolon', 'PASSWORD=abc;def', 'abc;def'],
    ['comma', 'PASSWORD=abc,def', 'abc,def'],
    ['ampersand', 'PASSWORD=abc&def', 'abc&def'],
    ['semicolon plus space', 'PASSWORD=abc; def', 'abc; def'],
    ['ampersand plus space', 'PASSWORD=abc& def', 'abc& def'],
  ])('never leaves a suffix visible when an unquoted secret contains a %s', (_name, source, secret) => {
    expect(values(source)).toEqual([secret]);
    expect(buildCleanText(source, scanText(source))).toBe('PASSWORD=[SECRET_1]');
  });

  it.each([
    '$Password = $storedCred',
    '$Password = $env:PASSWORD',
    '$Password = $(Get-Secret)',
    '$Password = (Generate-Password)',
    '$Password = Get-RandomPassword',
    '$Password = New-Guid',
    'password = [System.Web.Security.Membership]::GeneratePassword(12,2)',
    "password = @{ Value = 'secret' }",
    "password = @('one','two')",
    'password = { Get-Secret }',
    'password = GetPassword()',
    'password = & Get-Secret',
    'password = &\'Get-Secret\'',
    'password = .\\GetSecret.ps1',
    'password = [string] "literal"',
    "password = [char[]]('a','b')",
    'password = (GetPassword)',
    'password = GetPassword -Arg foo',
    'password = "prefix-$user"',
    'password = prefix-$user',
    '$Password = password',
    '$Password = [string] "literal"',
    '$script:Password = password',
    '$global:ApiKey = GetToken',
    '$env:PASSWORD=password',
    'password = true',
    'password = prompt',
    'password = <redacted>',
    'password = [SECRET_1]',
    'password = ****',
    'password = xxxx',
    'api_key_name=production',
    'password_command=Generate-Password',
    '--password --verbose',
  ])('leaves executable, placeholder, or non-secret values unchanged: %s', (source) => {
    expect(values(source)).toEqual([]);
  });
});
