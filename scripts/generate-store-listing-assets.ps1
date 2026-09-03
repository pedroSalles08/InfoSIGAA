[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackgroundPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputDirectory = Join-Path $repositoryRoot "store-assets/chrome-web-store"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

function New-Font {
  param(
    [float]$Size,
    [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
  )

  return [System.Drawing.Font]::new("Segoe UI", $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-RoundedPath {
  param(
    [System.Drawing.RectangleF]$Rectangle,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Rectangle.X, $Rectangle.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rectangle.X, $Rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-RgbPng {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-StoreScreenshot {
  param(
    [string]$SourceScreenshot,
    [string]$OutputName,
    [string]$Eyebrow,
    [string]$Heading,
    [string]$Body,
    [string]$Footer,
    [switch]$MaskTeacher
  )

  $canvas = [System.Drawing.Bitmap]::new(1280, 800, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $background = [System.Drawing.Image]::FromFile($BackgroundPath)
  $source = [System.Drawing.Image]::FromFile($SourceScreenshot)
  $icon = [System.Drawing.Image]::FromFile((Join-Path $repositoryRoot "icons/icon-128.png"))

  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(250, 250, 250))
  $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(181, 187, 194))
  $soft = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(141, 149, 158))
  $green = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(117, 224, 169))
  $panelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24, 24, 24))
  $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(76, 0, 0, 0))
  $borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(65, 68, 72), 1.5)
  $eyebrowFont = New-Font -Size 16 -Style Bold
  $headingFont = New-Font -Size 56 -Style Bold
  $bodyFont = New-Font -Size 24
  $brandFont = New-Font -Size 25 -Style Bold
  $footerFont = New-Font -Size 17 -Style Bold
  $maskFont = New-Font -Size 13 -Style Bold
  $maskBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(179, 190, 202))
  $maskBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(34, 34, 34))

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.DrawImage($background, [System.Drawing.Rectangle]::new(0, 0, 1280, 800))

    $graphics.DrawImage($icon, [System.Drawing.Rectangle]::new(78, 60, 50, 50))
    $graphics.DrawString("InfoSIGAA", $brandFont, $white, 145, 70)

    $graphics.DrawString($Eyebrow.ToUpperInvariant(), $eyebrowFont, $green, 82, 205)
    $graphics.DrawString($Heading, $headingFont, $white, [System.Drawing.RectangleF]::new(78, 246, 610, 185))
    $graphics.DrawString($Body, $bodyFont, $muted, [System.Drawing.RectangleF]::new(82, 450, 585, 112))

    $footerRectangle = [System.Drawing.RectangleF]::new(80, 645, 500, 54)
    $footerPath = New-RoundedPath -Rectangle $footerRectangle -Radius 14
    $graphics.FillPath($panelBrush, $footerPath)
    $graphics.DrawPath($borderPen, $footerPath)
    $graphics.DrawString($Footer, $footerFont, $soft, [System.Drawing.RectangleF]::new(101, 661, 460, 24))
    $footerPath.Dispose()

    $targetHeight = 660
    $targetWidth = [int][Math]::Round($source.Width * $targetHeight / $source.Height)
    $targetX = 832 + [int][Math]::Floor((380 - $targetWidth) / 2)
    $targetY = 74
    $shadowRectangle = [System.Drawing.RectangleF]::new($targetX - 22, $targetY - 20, $targetWidth + 44, $targetHeight + 40)
    $shadowPath = New-RoundedPath -Rectangle $shadowRectangle -Radius 24
    $graphics.FillPath($shadowBrush, $shadowPath)
    $shadowPath.Dispose()

    $panelRectangle = [System.Drawing.RectangleF]::new($targetX - 10, $targetY - 10, $targetWidth + 20, $targetHeight + 20)
    $panelPath = New-RoundedPath -Rectangle $panelRectangle -Radius 17
    $graphics.FillPath($panelBrush, $panelPath)
    $graphics.DrawPath($borderPen, $panelPath)
    $panelPath.Dispose()
    $graphics.DrawImage($source, [System.Drawing.Rectangle]::new($targetX, $targetY, $targetWidth, $targetHeight))

    if ($MaskTeacher) {
      $scale = $targetHeight / $source.Height
      $maskRectangle = [System.Drawing.RectangleF]::new(
        $targetX + (10 * $scale),
        $targetY + (323 * $scale),
        245 * $scale,
        19 * $scale
      )
      $graphics.FillRectangle($maskBackground, $maskRectangle)
      $graphics.DrawString("DADOS FICTÍCIOS", $maskFont, $maskBrush, $maskRectangle)
    }

    Save-RgbPng -Bitmap $canvas -Path (Join-Path $outputDirectory $OutputName)
  } finally {
    $maskBackground.Dispose()
    $maskBrush.Dispose()
    $maskFont.Dispose()
    $footerFont.Dispose()
    $brandFont.Dispose()
    $bodyFont.Dispose()
    $headingFont.Dispose()
    $eyebrowFont.Dispose()
    $borderPen.Dispose()
    $shadowBrush.Dispose()
    $panelBrush.Dispose()
    $green.Dispose()
    $soft.Dispose()
    $muted.Dispose()
    $white.Dispose()
    $icon.Dispose()
    $source.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

$backgroundDestination = Join-Path $outputDirectory "store-background-source.png"
Copy-Item -LiteralPath $BackgroundPath -Destination $backgroundDestination -Force

$sourceIcon = [System.Drawing.Image]::FromFile((Join-Path $repositoryRoot "icons/icon-128.png"))
$storeIcon = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$iconGraphics = [System.Drawing.Graphics]::FromImage($storeIcon)
try {
  $iconGraphics.Clear([System.Drawing.Color]::FromArgb(24, 24, 24))
  $iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $iconGraphics.DrawImage($sourceIcon, [System.Drawing.Rectangle]::new(0, 0, 128, 128))
  Save-RgbPng -Bitmap $storeIcon -Path (Join-Path $outputDirectory "infosigaa-store-icon-128.png")
} finally {
  $iconGraphics.Dispose()
  $storeIcon.Dispose()
  $sourceIcon.Dispose()
}

New-StoreScreenshot `
  -SourceScreenshot (Join-Path $repositoryRoot "screenshots/InfoSIGAA-com-card-escondido.png") `
  -OutputName "infosigaa-store-screenshot-01-overview.png" `
  -Eyebrow "Visão geral" `
  -Heading "Suas notas,`norganizadas." `
  -Body "Notas, médias, faltas e frequência em um painel local no Chrome." `
  -Footer "Dados no navegador  •  Atualização manual" `
  -MaskTeacher

New-StoreScreenshot `
  -SourceScreenshot (Join-Path $repositoryRoot "screenshots/InfoSIGAA-com-card-expandido-1.png") `
  -OutputName "infosigaa-store-screenshot-02-details.png" `
  -Eyebrow "Detalhes por matéria" `
  -Heading "Tudo o que importa,`nsem perder contexto." `
  -Body "Expanda cada matéria para consultar avaliações, médias e situação." `
  -Footer "Busca e filtros  •  Cards expansíveis" `
  -MaskTeacher

New-StoreScreenshot `
  -SourceScreenshot (Join-Path $repositoryRoot "screenshots/InfoSIGAA-com-card-expandido-2.png") `
  -OutputName "infosigaa-store-screenshot-03-attendance.png" `
  -Eyebrow "Frequência e faltas" `
  -Heading "Acompanhe sua`nfrequência de perto." `
  -Body "Veja presença atual, aulas ministradas e o máximo possível." `
  -Footer "Sem servidor de notas  •  Privacidade local"

Write-Output "Assets gerados em: $outputDirectory"
