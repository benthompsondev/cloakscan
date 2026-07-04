/**
 * Synthetic PowerShell shaped like the private stress case without containing
 * any real organization, host, path, account, or credential data.
 */
export const POWERSHELL_STRESS_INPUT = String.raw`$MailFrom = "automation@example.test"
$SmtpServer = "smtp-us.security-gateway.example.test"
$SmtpUsername = "aaaabbbb-1111-2222-3333-ccccdddd0000"
$SmtpUserPass = "fakeStrongPassword123!"

$FirstName = $FirstName -replace '[^a-zA-Z0-9]', ''
$LastName = $LastName -replace '[^a-zA-Z0-9]', ''
if ($value -match '^[A-Z]{2,5}[0-9]{3,8}$') { "matched" }

$ImportPath = "\\files01.example.test\Imports$\users.csv"
$newPassword = Generate-Password
Set-ADAccountPassword -Identity $SamAccountName -NewPassword $newPassword
Add-ADGroupMember -Identity "Folder Redirection" -Members $SamAccountName
Add-ADGroupMember -Identity "Some Application Group" -Members $SamAccountName

$ConnectionUri = "https://admin.example-gateway.test/powershell"
$SearchBase = "OU=Demo Users,DC=example,DC=test"
Write-Output "Tickets INC104892 and CHG543210 require review."`;

export const POWERSHELL_STRESS_EXPECTED = String.raw`$MailFrom = "[EMAIL_1]"
$SmtpServer = "[INTERNAL_HOST_1]"
$SmtpUsername = "[GUID_1]"
$SmtpUserPass = "[SECRET_1]"

$FirstName = $FirstName -replace '[^a-zA-Z0-9]', ''
$LastName = $LastName -replace '[^a-zA-Z0-9]', ''
if ($value -match '^[A-Z]{2,5}[0-9]{3,8}$') { "matched" }

$ImportPath = "[UNC_PATH_1]"
$newPassword = Generate-Password
Set-ADAccountPassword -Identity $SamAccountName -NewPassword $newPassword
Add-ADGroupMember -Identity "Folder Redirection" -Members $SamAccountName
Add-ADGroupMember -Identity "Some Application Group" -Members $SamAccountName

$ConnectionUri = "[INTERNAL_HOST_2]"
$SearchBase = "[AD_DN_1]"
Write-Output "Tickets [TICKET_ID_1] and [TICKET_ID_2] require review."`;
