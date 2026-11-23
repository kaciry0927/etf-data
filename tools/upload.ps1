<#
    upload.ps1 —— 用微信开发者工具 CLI 上传小程序代码（生成"开发版本"）

    前置条件（只需做一次）：
      1. 微信开发者工具已用「该小程序的开发者/管理员」微信登录；
      2. 开发者工具 → 设置 → 安全设置 → 打开「服务端口」；
         新版工具若要求令牌，把令牌填进 -Token 或环境变量 WECHAT_DEVTOOLS_CLI_TOKEN；
      3. project.config.json 里的 appid 不是 touristappid。

    用法：
      powershell -ExecutionPolicy Bypass -File .\tools\upload.ps1 -DryRun
      powershell -ExecutionPolicy Bypass -File .\tools\upload.ps1
      powershell -ExecutionPolicy Bypass -File .\tools\upload.ps1 -Version 1.1.1 -Desc "修了快照排序"
      powershell -ExecutionPolicy Bypass -File .\tools\upload.ps1 -CliPath "D:\微信web开发者工具\cli.bat"
      powershell -ExecutionPolicy Bypass -File .\tools\upload.ps1 -Token "在安全设置里复制的令牌"

    上传成功后：mp.weixin.qq.com → 管理 → 版本管理 → 开发版本 → 选为体验版。
#>
[CmdletBinding()]
param(
    [string]$Version = '1.1.0',
    [string]$Desc = '真实数据版：交易所份额 / 东财行情 / 中金所持仓 / 龙虎榜',
    [string]$CliPath,
    [string]$Token = $env:WECHAT_DEVTOOLS_CLI_TOKEN,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $projectRoot 'project.config.json'

if (-not (Test-Path $configPath)) {
    throw "找不到 project.config.json：$configPath"
}

$config = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$appid = $config.appid

if (-not $appid -or $appid -eq 'touristappid') {
    throw "project.config.json 里的 appid 是 '$appid'（游客模式无法上传）。请填入真实 AppID（wx 开头 18 位）。"
}
if ($appid -notmatch '^wx[0-9a-fA-F]{16}$') {
    throw "appid '$appid' 格式不对：应是 wx 开头 + 16 位十六进制，共 18 位。注意别填成 gh_ 开头的原始 ID。"
}

if (-not $CliPath) {
    $candidates = @(
        'D:\微信web开发者工具\cli.bat',
        'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat',
        'C:\Program Files\Tencent\微信web开发者工具\cli.bat',
        (Join-Path $env:LOCALAPPDATA 'Programs\微信web开发者工具\cli.bat')
    )
    $CliPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $CliPath -or -not (Test-Path $CliPath)) {
    throw "没找到微信开发者工具的 cli.bat，请用 -CliPath 指定完整路径。"
}

$cliArgs = @('upload', '--project', $projectRoot, '-v', $Version, '-d', $Desc)
if ($Token) { $cliArgs += @('--token', $Token) }

$appidShown = $appid
Write-Host "项目   : $projectRoot"
Write-Host "AppID  : $appidShown"
Write-Host "版本号 : $Version"
Write-Host "备注   : $Desc"
Write-Host "CLI    : $CliPath"
Write-Host ('命令   : cli ' + ($cliArgs -join ' '))
Write-Host ''

if ($DryRun) {
    Write-Host '（DryRun：只做校验，没有真的上传）' -ForegroundColor Cyan
    exit 0
}

& $CliPath @cliArgs
$code = $LASTEXITCODE

if ($code -eq 0) {
    Write-Host ''
    Write-Host '上传成功。接着去后台把它变成体验版：' -ForegroundColor Green
    Write-Host '  mp.weixin.qq.com → 管理 → 版本管理 → 开发版本 → 选为体验版 → 生成二维码'
    Write-Host '  mp.weixin.qq.com → 用户身份 → 成员管理 → 添加体验成员（不加的人扫二维码打不开）'
} else {
    Write-Host ''
    Write-Host "上传失败，退出码 $code。常见原因：" -ForegroundColor Yellow
    Write-Host '  - 开发者工具没登录，或登录的微信不是该小程序的开发者/管理员'
    Write-Host '  - 设置 → 安全设置 → 服务端口 没打开，或没配 CLI 令牌'
    Write-Host '  - AppID 与实际登录账号不匹配（该项目属于别的号）'
}

exit $code
