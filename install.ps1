# 安装「星火课堂」到 DSH 桌面 profile，然后需要重启 DSH。
# 用法：pwsh -ExecutionPolicy Bypass -File .\install.ps1          （卸载加 -Uninstall）
param([switch]$Uninstall, [switch]$SkipInstall)

$ErrorActionPreference = 'Stop'
$plugin = Split-Path -Parent $MyInvocation.MyCommand.Path
$deps = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies'
$node = Join-Path $deps 'node\bin\node.exe'
$pnpm = Join-Path $deps 'pnpm\bin\pnpm.mjs'
if (-not (Test-Path $node)) { $node = 'node' }

if ($Uninstall) {
  & $node (Join-Path $plugin 'install.mjs') --uninstall
  if (-not $SkipInstall) {
    Push-Location (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
    & $node $pnpm install
    Pop-Location
  }
  Write-Host '已卸载。重启 DSH 桌面端生效。' -ForegroundColor Yellow
  exit 0
}

& $node (Join-Path $plugin 'install.mjs')
if ($LASTEXITCODE -ne 0) { throw '登记失败' }

if (-not $SkipInstall) {
  Push-Location (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
  & $node $pnpm install
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw 'pnpm install 失败（退出码 ' + $code + '）' }
}

$linked = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\node_modules\dsh-bili-lesson\index.js'
if (Test-Path $linked) { Write-Host '链接就位：' $linked -ForegroundColor Green }
else { Write-Host '链接还没生成，检查上面的 pnpm 输出。' -ForegroundColor Yellow }

Write-Host ''
Write-Host '下一步：完全退出并重开 DSH 桌面端，左侧栏会出现「星火课堂」。' -ForegroundColor Cyan
Write-Host '撤销：pwsh -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall' -ForegroundColor DarkGray
