# Generates the Sush app icon set: a glossy cyan orb on a dark rounded tile.
# (Cyan #8fdcff -> deep teal #0e7490, to match the in-app accent/brand.)
# Outputs resources/icon.ico (multi-size) + resources/icon.png (256px).
# Pure System.Drawing - no external tools. Re-run any time to regenerate.
# (PowerShell 5.1: all arithmetic precomputed - inline math in constructor
# argument lists parses as arrays and explodes.)
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$resDir = Join-Path $root 'resources'
if (-not (Test-Path $resDir)) { New-Item -ItemType Directory -Path $resDir | Out-Null }

function Draw-SushIcon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  # Dark rounded tile
  $pad = [int][Math]::Max(1, $size * 0.02)
  $side = [int]($size - (2 * $pad))
  $r = [int][Math]::Max(2, $size * 0.22)
  $x = $pad; $y = $pad
  $right = [int]($x + $side - $r)
  $bottom = [int]($y + $side - $r)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, $r, $r, 180, 90)
  $path.AddArc($right, $y, $r, $r, 270, 90)
  $path.AddArc($right, $bottom, $r, $r, 0, 90)
  $path.AddArc($x, $bottom, $r, $r, 90, 90)
  $path.CloseFigure()
  $tileColor = [System.Drawing.Color]::FromArgb(255, 5, 7, 10)
  $tileBrush = New-Object System.Drawing.SolidBrush($tileColor)
  $g.FillPath($tileBrush, $path)

  # Orb with off-center radial gloss
  $cx = [single]($size * 0.5)
  $cy = [single]($size * 0.52)
  $orbR = [single]($size * 0.30)
  $ox = [single]($cx - $orbR); $oy = [single]($cy - $orbR); $od = [single](2 * $orbR)
  $orbPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $orbPath.AddEllipse($ox, $oy, $od, $od)
  $orb = New-Object System.Drawing.Drawing2D.PathGradientBrush($orbPath)
  $cpx = [single]($cx - ($orbR * 0.35)); $cpy = [single]($cy - ($orbR * 0.4))
  $orb.CenterPoint = New-Object System.Drawing.PointF($cpx, $cpy)
  # Dark variant: a moody deep-teal sphere lit from the upper-left, fading to
  # near-black at the rim so it reads as a dark glass orb rather than a bright bubble.
  $orb.CenterColor = [System.Drawing.Color]::FromArgb(255, 72, 173, 199)
  $orb.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(255, 8, 40, 52))
  $g.FillEllipse($orb, $ox, $oy, $od, $od)

  # Specular highlight
  $hlW = [single]($orbR * 0.55)
  $hlH = [single]($hlW * 0.65)
  $hx = [single]($cx - ($orbR * 0.55) - ($hlW * 0.4))
  $hy = [single]($cy - ($orbR * 0.62) - ($hlH * 0.3))
  $hlPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $hlPath.AddEllipse($hx, $hy, $hlW, $hlH)
  $hl = New-Object System.Drawing.Drawing2D.PathGradientBrush($hlPath)
  $hl.CenterColor = [System.Drawing.Color]::FromArgb(140, 200, 240, 255)
  $hl.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
  $g.FillEllipse($hl, $hx, $hy, $hlW, $hlH)

  $g.Dispose()
  return $bmp
}

# PNG (window/tray/linux)
$png = Draw-SushIcon 256
$pngPath = Join-Path $resDir 'icon.png'
$png.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$png.Dispose()

# Multi-size ICO (taskbar/exe). PNG-compressed entries are valid for Vista+.
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = @()
foreach ($s in $sizes) {
  $b = Draw-SushIcon $s
  $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
  $images += , @{ Size = $s; Bytes = $ms.ToArray() }
}

$icoPath = Join-Path $resDir 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$images.Count)
$offset = 6 + (16 * $images.Count)
foreach ($img in $images) {
  $dim = 0; if ($img.Size -lt 256) { $dim = $img.Size }
  $bw.Write([byte]$dim); $bw.Write([byte]$dim)
  $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$img.Bytes.Length)
  $bw.Write([uint32]$offset)
  $offset += $img.Bytes.Length
}
foreach ($img in $images) { $bw.Write($img.Bytes) }
$bw.Close()

Write-Output "icon.png + icon.ico written to $resDir"
