param(
  [string]$SourceFolder = "C:\Users\Matias Chomali\OneDrive - Maritex SpA\Matias\Area Gerencia\AI\APP VENTAS",
  [string]$RepoFolder = "C:\Users\Matias Chomali\OneDrive - Maritex SpA\Matias\Area Gerencia\AI\APP VENTAS\dashboard-web",
  [string]$TargetCsvRelativePath = "public\data\ventas.csv",
  [string]$TargetSellerMapRelativePath = "public\data\vendedores_equivalencia.csv"
)

$ErrorActionPreference = "Stop"

function Test-FileReadable {
  param([string]$Path)
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $stream.Close()
    return $true
  }
  catch {
    return $false
  }
}

function Get-SalesFiles {
  param(
    [string]$Folder,
    [string]$ExcludePrefix
  )
  $excludeNorm = if ($ExcludePrefix) { [System.IO.Path]::GetFullPath($ExcludePrefix).ToLower() } else { "" }
  $files = Get-ChildItem -Path $Folder -File -Recurse |
    Where-Object {
      $_.Extension -in @(".csv", ".xlsx", ".xls") -and
      -not ($_.Name.ToLower().Contains("vendedor") -and $_.Name.ToLower().Contains("equival")) -and
      (
        -not $excludeNorm -or
        -not ([System.IO.Path]::GetFullPath($_.FullName).ToLower().StartsWith($excludeNorm))
      )
    } |
    Sort-Object LastWriteTime -Descending
  return $files
}

function Get-BestAvailableSalesFile {
  param(
    [string]$Folder,
    [string]$ExcludePrefix
  )
  $files = Get-SalesFiles -Folder $Folder -ExcludePrefix $ExcludePrefix
  if (-not $files) {
    return $null
  }

  # Prioriza CSV si es reciente y evita archivos bloqueados.
  $sorted = $files | Sort-Object @{ Expression = { if ($_.Extension -eq ".csv") { 0 } else { 1 } } }, @{ Expression = { -$_.LastWriteTime.Ticks } }
  foreach ($f in $sorted) {
    if (Test-FileReadable -Path $f.FullName) {
      return $f
    }
  }
  return $null
}

function Convert-ExcelToCsv {
  param(
    [string]$ExcelPath,
    [string]$OutCsvPath
  )

  $excel = $null
  $workbook = $null
  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($ExcelPath)
    $worksheet = $workbook.Worksheets.Item(1)
    $worksheet.SaveAs($OutCsvPath, 62)
  }
  finally {
    if ($workbook -ne $null) {
      $workbook.Close($false)
      [System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
    }
    if ($excel -ne $null) {
      $excel.Quit()
      [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
  }
}

function Update-TargetCsv {
  param(
    [System.IO.FileInfo]$SourceFile,
    [string]$TargetCsvFullPath
  )

  $targetDir = Split-Path -Path $TargetCsvFullPath -Parent
  if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  if ($SourceFile.Extension -eq ".csv") {
    if ([System.IO.Path]::GetFullPath($SourceFile.FullName) -eq [System.IO.Path]::GetFullPath($TargetCsvFullPath)) {
      Write-Host "[SYNC] El archivo origen ya es ventas.csv en destino."
      return
    }
    Copy-Item -Path $SourceFile.FullName -Destination $TargetCsvFullPath -Force
    return
  }

  if ($SourceFile.Extension -in @(".xlsx", ".xls")) {
    $tempExcelPath = Join-Path $env:TEMP ("ventas_source_" + [guid]::NewGuid().ToString() + $SourceFile.Extension)
    Copy-Item -Path $SourceFile.FullName -Destination $tempExcelPath -Force
    try {
      Convert-ExcelToCsv -ExcelPath $tempExcelPath -OutCsvPath $TargetCsvFullPath
    }
    finally {
      if (Test-Path $tempExcelPath) {
        Remove-Item $tempExcelPath -Force
      }
    }
    return
  }

  throw "Formato no soportado: $($SourceFile.FullName)"
}

function Push-IfChanged {
  param([string]$RepoPath)

  Push-Location $RepoPath
  try {
    $statusOutput = git status --porcelain
    if (-not $statusOutput) {
      Write-Host "[SYNC] No hay cambios para subir."
      return
    }

    git add public/data/ventas.csv public/data/vendedores_equivalencia.csv
    $postAddStatus = git status --porcelain
    if (-not $postAddStatus) {
      Write-Host "[SYNC] No hay cambios en archivos de datos."
      return
    }

    git pull --rebase origin main
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo sincronizar con origin/main antes de commit."
    }

    git -c user.name="Matias Chomali" -c user.email="matiaschomali@users.noreply.github.com" commit -m "Auto-update dashboard data"
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo crear el commit automatico."
    }

    git push
    if ($LASTEXITCODE -ne 0) {
      throw "No se pudo hacer push de los cambios automaticos."
    }
    Write-Host "[SYNC] Cambios subidos a GitHub correctamente."
  }
  finally {
    Pop-Location
  }
}

function Sync-SellerEquivalence {
  param(
    [string]$SourceRoot,
    [string]$TargetSellerMapFullPath
  )

  $targetDir = Split-Path -Path $TargetSellerMapFullPath -Parent
  if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  $candidate = Get-ChildItem -Path $SourceRoot -File -Recurse |
    Where-Object { $_.Extension -eq ".csv" -and $_.Name.ToLower().Contains("vendedor") -and $_.Name.ToLower().Contains("equival") } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($null -eq $candidate) {
    Write-Host "[SYNC] No se encontro archivo de equivalencia de vendedores."
    return
  }

  if ([System.IO.Path]::GetFullPath($candidate.FullName) -eq [System.IO.Path]::GetFullPath($TargetSellerMapFullPath)) {
    Write-Host "[SYNC] La equivalencia de vendedores ya esta en destino."
    return
  }

  Copy-Item -Path $candidate.FullName -Destination $TargetSellerMapFullPath -Force
  Write-Host "[SYNC] Equivalencia de vendedores actualizada desde: $($candidate.FullName)"
}

try {
  if (!(Test-Path $SourceFolder)) {
    throw "No existe carpeta de origen: $SourceFolder"
  }
  if (!(Test-Path $RepoFolder)) {
    throw "No existe carpeta del repositorio: $RepoFolder"
  }

  $excludePrefix = Join-Path $RepoFolder "public\data"
  $filesFound = Get-SalesFiles -Folder $SourceFolder -ExcludePrefix $excludePrefix
  if (-not $filesFound) {
    throw "No se encontraron archivos CSV/XLSX/XLS en: $SourceFolder"
  }

  $latest = $null
  for ($i = 1; $i -le 6; $i++) {
    $latest = Get-BestAvailableSalesFile -Folder $SourceFolder -ExcludePrefix $excludePrefix
    if ($null -ne $latest) {
      break
    }
    Write-Host "[SYNC] Esperando archivo disponible... intento $i/6"
    Start-Sleep -Seconds 10
  }
  if ($null -eq $latest) {
    throw "No hay archivos disponibles para lectura (posiblemente bloqueados por Excel/OneDrive)."
  }

  $targetCsvFullPath = Join-Path $RepoFolder $TargetCsvRelativePath
  $targetSellerMapFullPath = Join-Path $RepoFolder $TargetSellerMapRelativePath
  Write-Host "[SYNC] Archivo origen detectado: $($latest.FullName)"

  Update-TargetCsv -SourceFile $latest -TargetCsvFullPath $targetCsvFullPath
  Sync-SellerEquivalence -SourceRoot $SourceFolder -TargetSellerMapFullPath $targetSellerMapFullPath
  Push-IfChanged -RepoPath $RepoFolder
}
catch {
  Write-Host "[ERROR] $($_.Exception.Message)"
  exit 1
}
