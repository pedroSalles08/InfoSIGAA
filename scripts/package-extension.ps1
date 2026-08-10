[CmdletBinding()]
param(
  [string]$ExpectedTag = ""
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $repositoryRoot "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = [string]$manifest.version

if ($version -notmatch '^\d+(\.\d+){0,3}$') {
  throw "Versao invalida no manifest.json: $version"
}

if ($ExpectedTag -and $ExpectedTag -ne "v$version") {
  throw "A tag '$ExpectedTag' nao corresponde a versao v$version do manifest.json."
}

$packageFiles = @(
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "src/background.js",
  "src/privacy-storage.js",
  "src/sigaa-parser.js",
  "src/snapshot.js",
  "src/sigaa-fetcher.js"
)

foreach ($relativePath in $packageFiles) {
  $sourcePath = Join-Path $repositoryRoot $relativePath
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Arquivo obrigatorio ausente: $relativePath"
  }
}

$distPath = Join-Path $repositoryRoot "dist"
New-Item -ItemType Directory -Path $distPath -Force | Out-Null

$archiveName = "InfoSIGAA-Chrome-v$version.zip"
$archivePath = Join-Path $distPath $archiveName
$checksumPath = "$archivePath.sha256"
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingPath = Join-Path $temporaryRoot ("infosigaa-package-" + [guid]::NewGuid().ToString("N"))

try {
  $resolvedStagingPath = [System.IO.Path]::GetFullPath($stagingPath)
  if (-not $resolvedStagingPath.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Diretorio temporario fora da area permitida: $stagingPath"
  }

  New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null

  foreach ($relativePath in $packageFiles) {
    $sourcePath = Join-Path $repositoryRoot $relativePath
    $destinationPath = Join-Path $stagingPath $relativePath
    $destinationDirectory = Split-Path $destinationPath -Parent
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
  }

  Compress-Archive -Path (Join-Path $stagingPath "*") -DestinationPath $archivePath -CompressionLevel Optimal -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
  try {
    $actualEntries = @(
      $archive.Entries |
        Where-Object { -not $_.FullName.EndsWith("/") } |
        ForEach-Object { $_.FullName.Replace("\", "/") } |
        Sort-Object
    )
  } finally {
    $archive.Dispose()
  }

  $expectedEntries = @($packageFiles | ForEach-Object { $_.Replace("\", "/") } | Sort-Object)
  $difference = Compare-Object -ReferenceObject $expectedEntries -DifferenceObject $actualEntries
  if ($difference) {
    $details = $difference | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
    throw "Conteudo inesperado no pacote:`n$($details -join "`n")"
  }

  if (-not ($actualEntries -contains "manifest.json")) {
    throw "manifest.json nao foi encontrado na raiz do ZIP."
  }

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText($checksumPath, "$hash  $archiveName`n", [System.Text.UTF8Encoding]::new($false))

  Write-Output "Pacote: $archivePath"
  Write-Output "SHA-256: $checksumPath"
  Write-Output "Versao: $version"
} finally {
  if (Test-Path -LiteralPath $stagingPath) {
    $resolvedStagingPath = [System.IO.Path]::GetFullPath($stagingPath)
    if ($resolvedStagingPath.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedStagingPath -Recurse -Force
    }
  }
}
