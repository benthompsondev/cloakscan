# Synthetic CloakGuard stress file. No real systems or people are represented.
# Author: Alex Demo
# Contact Bea Example if the import fails.
# Script prepared for Northwind Regional Hospital by Chris Sample.

[CmdletBinding()]
param(
    [string]$FirstName = "Élodie",
    [string]$LastName = "O’Connor-Smith",
    [string]$DisplayName = "Élodie O’Connor-Smith",
    [string]$Company = "Northwind Regional Hospital",
    [string]$Department = "Clinical Systems Demo",
    [string]$SamAccountName = "edemo",
    [string]$UpnSuffix = "accounts.example-health.org",
    [string]$MailDomain = "mail.example-health.org",
    [string]$SmtpServer = "relay01.example.internal",
    [string]$DomainController = "dc01.example.internal",
    [string]$SourcePath = "C:\Users\Alex Demo\Documents\Private Project\Imports\new users.csv",
    [string]$OutputPath = "D:\Operations Tools\Identity Reports\run output.csv"
)

$Name = "Chris"
$Owner = "Alex T."
$RequestedBy = "Bea Example"
$Approver = "Jean-Luc Picard"
$Facility = "Northwind Regional Hospital"
$Employer = "Example Community Health"
$BusinessUnit = "Regional Support Services"

$PrimaryUpn = "$SamAccountName@example-health.org"
$FallbackUpn = "$SamAccountName@branch.example.ca"
$AcceptedDomain = "branch.example.ca"
$EmailDomain = "example-health.org"
$SupportEmail = "helpdesk@example-health.org"
$ManagerEmail = "alex.demo@example.internal"

$UserLog = "C:\Users\Alex Demo\AppData\Local\CloakGuard Demo\identity run.log"
$InstallPath = "C:\Program Files\Example Agent\agent.exe"
$ArchivePath = "D:\Operations Tools\Identity Reports\Archive"
$LoosePath = C:\Users\Alex Demo\Documents\deploy.ps1 $TargetPath = D:\Ops\Output
$NetworkShare = "\\fs01.example.internal\Identity$\Private Imports\July"
$UnixHome = "/home/edemo/private/import.csv"
$MacHome = "/Users/edemo/Documents/private notes.txt"

$TenantId = "11111111-2222-3333-4444-555555555555"
$ClientId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
$SubscriptionId = "99999999-8888-7777-6666-555555555555"
$PrivateAddress = "10.42.16.28"
$BackupAddress = "172.16.5.10"
$GatewayV6 = "2001:db8::42"
$InternalPortal = "https://admin.example.internal/api/v1/users"
$TenantDomain = "northwind-demo.onmicrosoft.com"
$Server = "id-sync-01.example.internal"

$Password = "demo-password-not-real"
$SmtpUserPass = "demo-mail-password-not-real"
$ClientSecret = "demo-client-secret-not-real"
$AccessToken = "demo-access-token-not-real-123456"
$Authorization = "Bearer DEMO_NOT_REAL_TOKEN_1234567890"
$SecureValue = ConvertTo-SecureString "demo-secure-value-not-real" -AsPlainText -Force

# Generated values are executable expressions and must remain code.
$GeneratedPassword = New-Guid
$RandomPassword = Get-RandomPassword
$ExistingPassword = $Credential.GetNetworkCredential().Password

$DistinguishedName = "CN=Élodie O’Connor-Smith,OU=Demo Users,DC=ad,DC=example,DC=internal"
$Ticket = "INC104892"
$Change = "CHG543210"
$WorkItem = "OPS-2214"

$PersonRecord = [pscustomobject]@{
    Name              = "Alex"
    FullName          = "Alex Demo"
    FirstName         = "Alex"
    LastName          = "Demo"
    DisplayName       = "Alex Demo"
    CompanyName       = "Northwind Regional Hospital"
    Organization      = "Example Community Health"
    Department        = "Clinical Systems Demo"
    UserPrincipalName = "alex.demo@example-health.org"
    Phone             = "(555) 123-4567"
    Mobile            = "+1 555.222.3344 x89"
    Address           = "123 Demo Street, Exampleville"
    DateOfBirth       = "1990-01-31"
    PatientId         = "AB123456"
    HealthCard        = "1234-567-890"
}

Get-ADUser -Identity "edemo" -Server "dc01.example.internal"
Set-ADUser -Identity "edemo" -UserPrincipalName "edemo@example-health.org"
Move-ADObject -Identity $DistinguishedName -TargetPath "OU=Archived Users,DC=ad,DC=example,DC=internal"
Send-MailMessage -To "alex.demo@example-health.org" -From "automation@example-health.org" -SmtpServer $SmtpServer

# Regex syntax should remain intact.
$TicketPattern = '^(INC|CHG|REQ)\d{6}$'
if ($Ticket -match $TicketPattern) {
    Write-Verbose "Synthetic ticket shape accepted"
}

# Ordinary command names and variables should not be mistaken for people.
Get-Process -Name "WindowsTerminal"
$ServiceName = "ExampleAgent"
$Status = "Deployment Complete"
