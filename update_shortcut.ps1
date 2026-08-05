$dir = Get-Location
$iconPath = Join-Path $dir "favicon.ico"
$batPath = Join-Path $dir "GridifyPDF.bat"

$WshShell = New-Object -ComObject WScript.Shell

# Update/Create GridifyPDF.lnk in app folder
$shortcut = $WshShell.CreateShortcut((Join-Path $dir "GridifyPDF.lnk"))
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $dir.Path
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "Launch GridifyPDF Application"
$shortcut.Save()

# Update GridifyPDF - Shortcut.lnk if present
$shortcutExisting = $WshShell.CreateShortcut((Join-Path $dir "GridifyPDF - Shortcut.lnk"))
$shortcutExisting.TargetPath = $batPath
$shortcutExisting.WorkingDirectory = $dir.Path
$shortcutExisting.IconLocation = "$iconPath,0"
$shortcutExisting.Description = "Launch GridifyPDF Application"
$shortcutExisting.Save()

# Create shortcut on User's Desktop
$desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$desktopShortcut = $WshShell.CreateShortcut((Join-Path $desktopPath "GridifyPDF.lnk"))
$desktopShortcut.TargetPath = $batPath
$desktopShortcut.WorkingDirectory = $dir.Path
$desktopShortcut.IconLocation = "$iconPath,0"
$desktopShortcut.Description = "Launch GridifyPDF Application"
$desktopShortcut.Save()

Write-Host "Successfully attached custom icon to shortcuts!"
