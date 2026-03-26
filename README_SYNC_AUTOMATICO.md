# Sync automatico de ventas a GitHub Pages

Este script actualiza automaticamente `public/data/ventas.csv` y hace `git push`.

## Que hace

1. Busca el archivo mas reciente en la carpeta de ventas (`.csv`, `.xlsx`, `.xls`).
2. Si es Excel, lo convierte a CSV (hoja 1) usando Excel de Windows.
3. Reemplaza `public/data/ventas.csv`.
4. Si hubo cambios, hace commit y push al repo.
5. GitHub Pages redeploya solo.

## Ejecucion manual

Desde `dashboard-web`:

```powershell
powershell -ExecutionPolicy Bypass -File ".\sync_ventas_to_github.ps1"
```

## Programarlo automatico (cada 5 min)

Ejecuta este comando una sola vez:

```powershell
$scriptPath = "C:\Users\Matias Chomali\OneDrive - Maritex SpA\Matias\Area Gerencia\AI\APP VENTAS\dashboard-web\sync_ventas_to_github.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "Maritex-Sync-Ventas-GitHub" -Action $action -Trigger $trigger -Description "Sync ventas.csv a GitHub Pages" -Force
```

## Notas

- Requiere que Git ya este autenticado en esta maquina para poder hacer push sin pedir credenciales.
- Si el archivo de ventas es muy grande, el deploy puede tardar.
- Si quieres, se puede cambiar para detectar un archivo especifico en vez del mas reciente.
