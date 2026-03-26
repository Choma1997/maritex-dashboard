param(
  [string]$SourceFolder = "C:\Users\Matias Chomali\OneDrive - Maritex SpA\Matias\Area Gerencia\AI\APP VENTAS",
  [string]$RepoFolder = "C:\Users\Matias Chomali\OneDrive - Maritex SpA\Matias\Area Gerencia\AI\APP VENTAS\dashboard-web",
  [string]$TargetCsvRelativePath = "public\data\ventas.csv"
)

$ErrorActionPreference = "Stop"

function Get-LatestSalesFile {
  param([string]$Folder)
  $files = Get-ChildItem -Path $Folder -File -Recurse |
    Where-Object { $_.Extension -in @(".csv", ".xlsx", ".xls") } |
    Sort-Object LastWriteTime -Descending
  return $files | Select-Object -First 1
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
    Convert-ExcelToCsv -ExcelPath $SourceFile.FullName -OutCsvPath $TargetCsvFullPath
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

  $latest = Get-LatestSalesFile -Folder $SourceFolder
  if ($null -eq $latest) {
    throw "No se encontraron archivos CSV/XLSX/XLS en: $SourceFolder"
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
