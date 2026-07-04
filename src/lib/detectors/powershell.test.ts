import { describe, expect, it } from 'vitest';
import { uncPathDetector } from './unc';
import { adDnDetector } from './activedirectory';
import { ipv6Detector, isValidIpv6 } from './ipv6';
import { guidDetector } from './guids';
import {
  psInfrastructureAssignmentDetector,
  secureStringLiteralDetector,
  psIdentityParamDetector,
  psServerParamDetector,
} from './powershell';
import { secretAssignmentDetector } from './secrets';
import { internalHostnameDetector } from './internal';
import { scanText } from '../scan';
import { buildCleanText } from '../sanitize';

const values = (detector: { detect(text: string): { value: string }[] }, text: string) =>
  detector.detect(text).map((m) => m.value);

describe('UNC path detector', () => {
  it('finds UNC paths including admin shares', () => {
    expect(
      values(uncPathDetector, String.raw`Import-Csv -Path "\\fs01\Deploy$\uploads\accounts.csv"`),
    ).toEqual([String.raw`\\fs01\Deploy$\uploads\accounts.csv`]);
  });

  it('finds FQDN servers and bare shares', () => {
    expect(values(uncPathDetector, String.raw`copy \\fs01.example.test\share\a.txt here`)).toEqual([
      String.raw`\\fs01.example.test\share\a.txt`,
    ]);
  });

  it('ignores escaped-looking double backslashes without a share', () => {
    expect(values(uncPathDetector, String.raw`regex is \\d+ and \\w+`)).toEqual([]);
  });
});

describe('AD distinguished name detector', () => {
  it('finds full DNs with spaces in values', () => {
    expect(
      values(adDnDetector, 'move to "OU=Terminated Users,OU=Accounts,DC=ad,DC=example,DC=test"'),
    ).toEqual(['OU=Terminated Users,OU=Accounts,DC=ad,DC=example,DC=test']);
  });

  it('finds domain-only DNs and stops at the DN end', () => {
    const [m] = adDnDetector.detect('SearchBase DC=example,DC=test if the retry fails.');
    expect(m.value).toBe('DC=example,DC=test');
  });

  it('ignores single components and comparisons', () => {
    expect(values(adDnDetector, 'if ($x -like "*OU=Terminated Users,*") { }')).toEqual([]);
    expect(values(adDnDetector, 'DC=only-one')).toEqual([]);
  });
});

describe('IPv6 detector', () => {
  it('validates uncompressed and compressed forms', () => {
    expect(isValidIpv6('2001:db8:0:0:0:0:0:1')).toBe(true);
    expect(isValidIpv6('2001:db8::1')).toBe(true);
    expect(isValidIpv6('fe80::')).toBe(true);
    expect(isValidIpv6('::1')).toBe(true);
  });

  it('rejects invalid forms', () => {
    expect(isValidIpv6('2001:db8')).toBe(false); // too few groups, no ::
    expect(isValidIpv6('1:2:3:4:5:6:7:8:9')).toBe(false); // too many groups
    expect(isValidIpv6('2001:db8::1::2')).toBe(false); // double compression
    expect(isValidIpv6('2001:dg8::1')).toBe(false); // non-hex
    expect(isValidIpv6('09:42:11')).toBe(false); // timestamp shape
  });

  it('finds addresses in text but not timestamps or PowerShell :: access', () => {
    expect(values(ipv6Detector, 'ping 2001:db8::1 at 09:42:11')).toEqual(['2001:db8::1']);
    expect(values(ipv6Detector, '[System.Math]::Round($x) and [ipaddress]::Any')).toEqual([]);
    expect(values(ipv6Detector, 'MAC 00:11:22:33:44:55 is not an IP')).toEqual([]);
  });
});

describe('GUID identifier detector', () => {
  const guid = 'aaaabbbb-1111-2222-3333-ccccdddd0000';

  it('flags labeled cloud identifiers at high confidence', () => {
    const [m] = guidDetector.detect(`TenantId: ${guid}`);
    expect(m.value).toBe(guid);
    expect(m.confidence).toBe('high');
  });

  it('supports $var = "guid" assignment labels', () => {
    const [m] = guidDetector.detect(`$ClientId = "${guid}"`);
    expect(m.value).toBe(guid);
    expect(m.confidence).toBe('high');
  });

  it('flags bare GUIDs at low confidence', () => {
    const [m] = guidDetector.detect(`correlation ${guid} logged`);
    expect(m.confidence).toBe('low');
  });

  it('keeps one finding when labeled and bare overlap', () => {
    const findings = scanText(`SubscriptionId=${guid}`);
    expect(findings.filter((f) => f.detectorId === 'guid-identifier')).toHaveLength(1);
    expect(findings[0].confidence).toBe('high');
  });
});

describe('PowerShell secret shapes', () => {
  it('finds ConvertTo-SecureString literals', () => {
    expect(
      values(secureStringLiteralDetector, `ConvertTo-SecureString "demo-not-real" -AsPlainText`),
    ).toEqual(['demo-not-real']);
    expect(
      values(secureStringLiteralDetector, 'ConvertTo-SecureString $pass -AsPlainText'),
    ).toEqual([]);
  });

  it('redacts only the SecureString literal and preserves its quotes', () => {
    const text =
      '$BackupPass = ConvertTo-SecureString "demo-secret-not-real" -AsPlainText -Force';
    expect(buildCleanText(text, scanText(text))).toBe(
      '$BackupPass = ConvertTo-SecureString "[SECRET_1]" -AsPlainText -Force',
    );
  });

  it('finds compound password variable assignments', () => {
    expect(values(secretAssignmentDetector, '$SmtpUserPass = "demo-value-1"')).toEqual([
      'demo-value-1',
    ]);
  });

  it('skips variables, booleans, function calls, cmdlets, and expressions', () => {
    expect(values(secretAssignmentDetector, '$SmtpUserPass = $storedCred')).toEqual([]);
    expect(values(secretAssignmentDetector, '$Bypass = $true')).toEqual([]);
    expect(values(secretAssignmentDetector, 'password = prompt')).toEqual([]);
    expect(values(secretAssignmentDetector, '$cred = New-Object PSCredential')).toEqual([]);
    expect(values(secretAssignmentDetector, '$newPassword = Generate-Password')).toEqual([]);
    expect(values(secretAssignmentDetector, '$newPassword = New-Guid')).toEqual([]);
    expect(values(secretAssignmentDetector, '$newPassword = Get-RandomPassword')).toEqual([]);
    expect(values(secretAssignmentDetector, '$newPassword = (Generate-Password)')).toEqual([]);
    expect(
      values(
        secretAssignmentDetector,
        '$newPassword = ConvertTo-SecureString $value -AsPlainText -Force',
      ),
    ).toEqual([]);
  });
});

describe('PowerShell parameter detectors', () => {
  it('finds literal identity values, quoted or bare', () => {
    expect(values(psIdentityParamDetector, 'Get-ADUser -Identity jsmith.demo')).toEqual([
      'jsmith.demo',
    ]);
    expect(values(psIdentityParamDetector, 'Set-Mailbox -Identity "shared.box"')).toEqual([
      'shared.box',
    ]);
  });

  it('skips variable identities', () => {
    expect(values(psIdentityParamDetector, 'Get-ADUser -Identity $user.SamAccountName')).toEqual(
      [],
    );
  });

  it('does not treat AD group/display names as usernames', () => {
    expect(
      values(
        psIdentityParamDetector,
        'Add-ADGroupMember -Identity "Folder Redirection" -Members $user',
      ),
    ).toEqual([]);
    expect(
      values(
        psIdentityParamDetector,
        'Add-ADGroupMember -Identity "SomeApplicationGroup" -Members $user',
      ),
    ).toEqual([]);
  });

  it('finds literal server values', () => {
    expect(values(psServerParamDetector, 'Get-ADUser x -Server dc01.example.test')).toEqual([
      'dc01.example.test',
    ]);
    expect(values(psServerParamDetector, '-SmtpServer "relay01"')).toEqual(['relay01']);
    expect(values(psServerParamDetector, 'Invoke-Command -ComputerName $target')).toEqual([]);
  });

  it('finds quoted infrastructure values assigned to contextual names', () => {
    expect(
      values(
        psInfrastructureAssignmentDetector,
        '$SmtpServer = "smtp-us.security-gateway.example.test"',
      ),
    ).toEqual(['smtp-us.security-gateway.example.test']);
    expect(
      values(
        psInfrastructureAssignmentDetector,
        '$settings.ConnectionUri = "https://admin.example-gateway.test/powershell"',
      ),
    ).toEqual(['https://admin.example-gateway.test/powershell']);
  });
});

describe('tenant domains', () => {
  it('flags onmicrosoft.com tenant domains as internal hostnames', () => {
    expect(
      values(internalHostnameDetector, 'route to contoso-demo.mail.onmicrosoft.com now'),
    ).toEqual(['contoso-demo.mail.onmicrosoft.com']);
  });

  it('redacts the whole address when the tenant domain is in an email', () => {
    const text = 'RemoteRoutingAddress ademo@contoso-demo.mail.onmicrosoft.com set';
    const findings = scanText(text);
    expect(findings.map((f) => f.detectorId)).toEqual(['email']);
    expect(buildCleanText(text, findings)).toBe('RemoteRoutingAddress [EMAIL_1] set');
  });
});

describe('formatting with PowerShell shapes', () => {
  it('preserves whitespace and newlines exactly', () => {
    const text = `\t$SmtpUserPass = "demo-value-1"\r\n  copy \\\\fs01\\share$\\a.csv  \n`;
    const cleaned = buildCleanText(text, scanText(text));
    expect(cleaned).toBe(`\t$SmtpUserPass = "[SECRET_1]"\r\n  copy [UNC_PATH_1]  \n`);
  });
});
