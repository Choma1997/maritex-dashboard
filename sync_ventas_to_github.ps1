param(
  [string]$SourceFolder = "C:\Users\Matias Chomali\OneDrive - Maritex SpA\Matias\Area Gerencia\AI\APP VENTAS",
  [string]$RepoFolder = "C:\Users\Matias Chomali\OneDrive - Maritex SpA\Matias\Area Gerencia\AI\APP VENTAS\dashboard-web",
  [string]$TargetCsvRelativePath = "public\data\ventas.csv"
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
  param([string]$Folder)
  $files = Get-ChildItem -Path $Folder -File -Recurse |
    Where-Object { $_.Extension -in @(".csv", ".xlsx", ".xls") } |
    Sort-Object LastWriteTime -Descending
  return $files
}

function Get-BestAvailableSalesFile {
  param([string]$Folder)
  $files = Get-SalesFiles -Folder $Folder
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

    git add public/data/ventas.csv
    $postAddStatus = git status --porcelain
    if (-not $postAddStatus) {
      Write-Host "[SYNC] No hay cambios en ventas.csv."
      return
    }

    git commit -m "Auto-update ventas data"
    git push
    Write-Host "[SYNC] Cambios subidos a GitHub correctamente."
  }
  finally {
    Pop-Location
  }
}

try {
  if (!(Test-Path $SourceFolder)) {
    throw "No existe carpeta de origen: $SourceFolder"
  }
  if (!(Test-Path $RepoFolder)) {
    throw "No existe carpeta del repositorio: $RepoFolder"
  }

  $filesFound = Get-SalesFiles -Folder $SourceFolder
  if (-not $filesFound) {
    throw "No se encontraron archivos CSV/XLSX/XLS en: $SourceFolder"
  }

  $latest = $null
  for ($i = 1; $i -le 6; $i++) {
    $latest = Get-BestAvailableSalesFile -Folder $SourceFolder
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
  Write-Host "[SYNC] Archivo origen detectado: $($latest.FullName)"

  Update-TargetCsv -SourceFile $latest -TargetCsvFullPath $targetCsvFullPath
  Push-IfChanged -RepoPath $RepoFolder
}
catch {
  Write-Host "[ERROR] $($_.Exception.Message)"
  exit 1
}
