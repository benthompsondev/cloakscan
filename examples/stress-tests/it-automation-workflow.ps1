# Synthetic IT automation stress fixture. Every name, host, group, and value
# is invented (Contoso/Nirv/example style). It exercises the v1.3 surface:
# org terms inside identifiers, AD groups, review leads, credential workflow,
# regex protection, and generated passwords that must stay untouched.
#
# Script: New-NirvStarter.ps1 — provision a starter account end to end.
# History:
#   2024-02-11  Created by JQ
#   2024-06-03  Modified by TR — weak-password compliance cycle added
param(
    [string]$CsvPath = "\\fs01.corp.contoso.example\hr\starters\latest.csv",
    [string]$NirvExportPath = "D:\Jobs\NirvExport.csv"
)

function Enable-NirvAccount {
    param([string]$NirvSystemID, [string]$SamAccountName)

    # Nirv access is mirrored onto the user object for the nightly report.
    $objUser = Get-ADUser $SamAccountName -Properties SamAccountName, UserPrincipalName, otherTelephone
    $objUser.NirvAccess = $true
    $nirvSystemId = $NirvSystemID.Trim()

    # Clean the identifier the same way the Nirv importer does.
    $clean = $nirvSystemId -replace '[^a-zA-Z0-9]', ''
    return $clean
}

# --- AD onboarding -----------------------------------------------------------
$upn = "alex.demo@corp.contoso.example"
Add-ADGroupMember -Identity "APP-NirvPortal-Users" -Members $SamAccountName
Add-ADGroupMember -Identity "LIC-M365-E3-Standard" -Members $SamAccountName
# Starter OU: OU=Starters,OU=Accounts,DC=corp,DC=contoso,DC=example

# Generated passwords are expressions, never literals — must stay untouched.
$newPassword = New-StarterPassword -Length 16
Set-ADAccountPassword -Identity $SamAccountName -NewPassword $newPassword

# --- weak-password compliance scheduled workflow -----------------------------
$state = Get-Content -Path cycle_state.json | ConvertFrom-Json
Add-Content -Path weekly-audit.log -Value "cycle $($state.cycle) checked"
Copy-Item hr_snapshot.csv -Destination \\fs01.corp.contoso.example\jobs\archive\

# --- AD/Exchange matching and reporting --------------------------------------
$session = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri "http://exch01.ad.contoso.example/PowerShell/"
Import-PSSession $session
Get-Recipient $upn | Where-Object { $_.RecipientTypeDetails -eq "RemoteUserMailbox" }
Enable-RemoteMailbox $SamAccountName -RemoteRoutingAddress "alex.demo@contoso-demo.mail.onmicrosoft.com"

# --- SMTP + credential workflow ----------------------------------------------
$SmtpServer = "smtp.corp.contoso.example"
$SmtpPort = 587
$cred = Import-Clixml -Path "D:\Jobs\smtp_cred.clixml"
Send-MailMessage -SmtpServer $SmtpServer -Port $SmtpPort -Credential $cred `
    -From "reports@corp.contoso.example" -To "servicedesk@corp.contoso.example" `
    -Subject "Nirv starter export" -Body "See $NirvExportPath"

# CSV header the exporter writes:
# Employee ID,AD Username,UPN,Email,First Name,Last Name,Activation Date,Status
