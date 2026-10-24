# Memory of the app and every WebView2 process it started, as Task Manager's
# "Memory" column counts it (private working set).
#
#   powershell -File bench/memory.ps1 -RootPid <pid>
param([Parameter(Mandatory)][int]$RootPid)
$all = Get-CimInstance Win32_Process
$tree = @($RootPid)
do {
  $before = $tree.Count
  foreach ($p in $all) {
    if ($tree -contains $p.ParentProcessId -and $tree -notcontains $p.ProcessId) { $tree += $p.ProcessId }
  }
} while ($tree.Count -ne $before)
$total = 0
foreach ($id in $tree) {
  $proc = $all | Where-Object ProcessId -eq $id
  $kind = if ($proc.CommandLine -match '--type=([\w-]+)') { $matches[1] } elseif ($id -eq $RootPid) { 'app' } else { 'webview' }
  $mb = (Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess=$id").WorkingSetPrivate / 1MB
  $total += $mb
  '{0,-16} {1,7:N1} MB' -f $kind, $mb
}
'{0,-16} {1,7:N1} MB' -f 'TOTAL', $total
