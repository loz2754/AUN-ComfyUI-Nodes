[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [string]$ReleaseNotes,

    [switch]$NoTag,
    [switch]$NoChangelog,
    [switch]$NoPush,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'git'
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    foreach ($argument in $Arguments) {
        [void]$psi.ArgumentList.Add($argument)
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    [void]$process.Start()

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    $exitCode = $process.ExitCode
    $output = @()

    if (-not [string]::IsNullOrWhiteSpace($stdout)) {
        $output += ($stdout -split "`r?`n" | Where-Object { $_ -ne '' })
    }

    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        $output += ($stderr -split "`r?`n" | Where-Object { $_ -ne '' })
    }

    if ($exitCode -ne 0) {
        $message = if ($output) { ($output | Out-String).Trim() } else { "git $($Arguments -join ' ') failed." }
        throw $message
    }

    return $output
}

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[release] $Message"
}

function Get-FirstLine {
    param($Value)

    if ($null -eq $Value) {
        return ''
    }

    $first = $Value | Select-Object -First 1
    if ($null -eq $first) {
        return ''
    }

    return $first.ToString().Trim()
}

function Update-Changelog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Version,

        [Parameter(Mandatory = $true)]
        [string]$ReleaseDate
    )

    $content = Get-Content -Path $Path -Raw
    $pattern = '(?ms)^## \[Unreleased\]\s*(?<body>.*?)(?=^## \[[^\]]+\]|\z)'
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) {
        throw 'CHANGELOG.md does not contain a recognizable [Unreleased] section.'
    }

    $releasedBody = $match.Groups['body'].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($releasedBody)) {
        $releasedBody = "### Notes`r`n`r`n- Release notes pending."
    }

    $newUnreleased = @(
        '## [Unreleased]',
        '',
        '### Added',
        '',
        '### Changed',
        '',
        '### Fixed',
        '',
        '### Notes',
        ''
    ) -join "`r`n"

    $replacement = @(
        $newUnreleased,
        "## [$Version] - $ReleaseDate",
        '',
        $releasedBody,
        ''
    ) -join "`r`n"

    $updatedContent = [regex]::Replace($content, $pattern, $replacement, 1)
    Set-Content -Path $Path -Value $updatedContent -NoNewline
}

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptPath '..')
$pyprojectPath = Join-Path $repoRoot 'pyproject.toml'
$changelogPath = Join-Path $repoRoot 'CHANGELOG.md'

if (-not (Test-Path $pyprojectPath)) {
    throw "Could not find pyproject.toml at $pyprojectPath"
}

if (-not $NoChangelog -and -not (Test-Path $changelogPath)) {
    throw "Could not find CHANGELOG.md at $changelogPath"
}

Write-Step "Repo root: $repoRoot"

$insideWorkTree = Invoke-Git -Arguments @('-C', $repoRoot, 'rev-parse', '--is-inside-work-tree')
if ((Get-FirstLine -Value $insideWorkTree) -ne 'true') {
    throw 'This script must run inside a git work tree.'
}

$branch = Get-FirstLine -Value (Invoke-Git -Arguments @('-C', $repoRoot, 'branch', '--show-current'))
if ($branch -ne 'main') {
    throw "Release script must run from 'main'. Current branch: '$branch'."
}

$statusOutput = Invoke-Git -Arguments @('-C', $repoRoot, 'status', '--porcelain')
$isDirty = [bool]($statusOutput | Where-Object { $_.ToString().Trim() })
if ($isDirty -and -not $DryRun) {
    throw 'Working tree is not clean. Commit, stash, or discard changes before releasing.'
}

if ($isDirty) {
    Write-Step 'Dry run: working tree is dirty, so no release changes will be applied.'
}

$pyprojectContent = Get-Content -Path $pyprojectPath -Raw
$versionMatch = [regex]::Match($pyprojectContent, '(?m)^version\s*=\s*"(?<version>[^"]+)"\s*$')
if (-not $versionMatch.Success) {
    throw 'Could not find a top-level version entry in pyproject.toml.'
}

$currentVersion = $versionMatch.Groups['version'].Value
if ($currentVersion -eq $Version) {
    throw "Requested version matches current version ($Version)."
}

$tagName = "v$Version"
$existingTag = Invoke-Git -Arguments @('-C', $repoRoot, 'tag', '--list', $tagName)
if ((Get-FirstLine -Value $existingTag) -eq $tagName) {
    throw "Tag '$tagName' already exists."
}

$releaseDate = Get-Date -Format 'yyyy-MM-dd'

Write-Step "Current version: $currentVersion"
Write-Step "New version: $Version"

if ($DryRun) {
    Write-Step "Dry run complete. Planned commit message: release: v$Version"
    if (-not $NoChangelog) {
        Write-Step "Dry run complete. Planned changelog release date: $releaseDate"
    }
    if (-not $NoTag) {
        Write-Step "Dry run complete. Planned annotated tag: $tagName"
    }
    if (-not $NoPush) {
        Write-Step 'Dry run complete. Planned push: origin main'
    }
    return
}

$updatedContent = [regex]::Replace(
    $pyprojectContent,
    '(?m)^version\s*=\s*"[^"]+"\s*$',
    "version = `"$Version`"",
    1
)

Set-Content -Path $pyprojectPath -Value $updatedContent -NoNewline

Write-Step 'Updated pyproject.toml version.'

if (-not $NoChangelog) {
    Update-Changelog -Path $changelogPath -Version $Version -ReleaseDate $releaseDate
    Write-Step 'Updated CHANGELOG.md release section.'
}

if ($NoChangelog) {
    Invoke-Git -Arguments @('-C', $repoRoot, 'add', 'pyproject.toml') | Out-Null
}
else {
    Invoke-Git -Arguments @('-C', $repoRoot, 'add', 'pyproject.toml', 'CHANGELOG.md') | Out-Null
}

Invoke-Git -Arguments @('-C', $repoRoot, 'commit', '-m', "release: v$Version") | Out-Null
Write-Step "Created commit: release: v$Version"

if (-not $NoTag) {
    $tagMessage = "Release $tagName"
    if (-not [string]::IsNullOrWhiteSpace($ReleaseNotes)) {
        $tagMessage = "$tagMessage`n`n$ReleaseNotes"
    }

    Invoke-Git -Arguments @('-C', $repoRoot, 'tag', '-a', $tagName, '-m', $tagMessage) | Out-Null
    Write-Step "Created tag: $tagName"
}

if (-not $NoPush) {
    Invoke-Git -Arguments @('-C', $repoRoot, 'push', 'origin', 'main') | Out-Null
    Write-Step 'Pushed branch: origin main'

    if (-not $NoTag) {
        Invoke-Git -Arguments @('-C', $repoRoot, 'push', 'origin', $tagName) | Out-Null
        Write-Step "Pushed tag: $tagName"
    }
}

Write-Step 'Release complete.'