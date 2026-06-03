# Quick listening-ports summary for PowerShell
$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
    netstat -ano -p TCP | Select-String 'LISTENING'
    return
}
$connections | Select-Object -Property LocalPort, OwningProcess |
    Sort-Object LocalPort |
    Format-Table -AutoSize
