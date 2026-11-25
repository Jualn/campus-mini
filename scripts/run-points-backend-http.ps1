param(
  [string]$JavaHome = 'D:\Jualn\Java\jdk-17.0.18+8'
)
$ErrorActionPreference = 'Stop'
$miniRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendRoot = (Resolve-Path (Join-Path $miniRoot '../backend')).Path
$fixtureReport = Join-Path $backendRoot 'target/surefire-reports/TEST-cn.jualn.miniapp.module.admin.auth.rbac.PointsIntegrationHttpTest.xml'
if (!(Test-Path -LiteralPath $fixtureReport)) { throw 'Existing compiled Backend fixture/report required; no Backend build or source write is performed.' }
$report = [xml](Get-Content -LiteralPath $fixtureReport -Raw)
$classpath = (($report.testsuite.properties.property | Where-Object name -eq 'java.class.path').value -split ';' | Where-Object { $_ }) -join ';'
if (!$classpath -or @($classpath -split ';' | Where-Object { !(Test-Path -LiteralPath $_) }).Count) { throw 'Backend fixture classpath is missing or stale.' }
$runId = 'mini' + (Get-Date -Format 'yyyyMMddHHmmss') + ([guid]::NewGuid().ToString('N').Substring(0,6))
$mysqlName = 'codex-points-consumer-mysql-' + $runId
$redisName = 'codex-points-consumer-redis-' + $runId
$runtime = Join-Path ([System.IO.Path]::GetTempPath()) ('points-consumer-' + $runId)
[void](New-Item -ItemType Directory -Path $runtime)
$evidencePath = Join-Path $miniRoot 'docs/operations/points-v1/backend-http-evidence.json'
$javaLog = Join-Path $runtime 'backend-consumer.log'
$priorRedis = $env:POINTS_INTEGRATION_REDIS_PORT
$owned = @()
try {
  docker run --detach --name $mysqlName --label "codex.task=mini-points-consumer" --label "codex.run=$runId" -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -p '127.0.0.1::3306' mysql:8.4 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start dedicated MySQL' }; $owned += $mysqlName
  docker run --detach --name $redisName --label "codex.task=mini-points-consumer" --label "codex.run=$runId" -p '127.0.0.1::6379' redis:7-alpine | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not start dedicated Redis' }; $owned += $redisName
  $ready = $false
  for ($i=0; $i -lt 50; $i++) {
    docker exec $mysqlName mysql --protocol=TCP --host=127.0.0.1 --user=root --execute="SELECT 1" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Milliseconds 500
  }
  if (!$ready) { throw 'Dedicated MySQL startup failed' }
  $mysqlPort = ((docker port $mysqlName '3306/tcp') -split ':')[-1]
  $redisPort = ((docker port $redisName '6379/tcp') -split ':')[-1]
  $env:POINTS_INTEGRATION_REDIS_PORT = $redisPort
  $classes = Join-Path $runtime 'classes'; [void](New-Item -ItemType Directory -Path $classes)
  $source = Join-Path $PSScriptRoot 'points/PointsMiniConsumerBackend.java'
  $compileArgs = Join-Path $runtime 'javac.args'
  @('-classpath', ('"'+$classpath.Replace('\','/')+'"'), '-d', ('"'+$classes.Replace('\','/')+'"'), ('"'+$source.Replace('\','/')+'"')) | Set-Content -LiteralPath $compileArgs
  & (Join-Path $JavaHome 'bin/javac.exe') ('@'+$compileArgs)
  if ($LASTEXITCODE -ne 0) { throw 'Consumer launcher compilation failed' }
  $node = (Get-Command node.exe).Source
  $javaArgs = Join-Path $runtime 'java.args'
  @('-classpath', ('"'+($classes+';'+$classpath).Replace('\','/')+'"'), ('-Dpoints.integration.jdbcUrl=jdbc:mysql://127.0.0.1:'+$mysqlPort+'/points_integration_test_'+$runId), 'cn.jualn.miniapp.module.admin.auth.rbac.PointsMiniConsumerBackend', ('"'+$miniRoot.Replace('\','/')+'"'), ('"'+$node.Replace('\','/')+'"'), ('"'+$evidencePath.Replace('\','/')+'"')) | Set-Content -LiteralPath $javaArgs
  Push-Location $runtime
  try {
    & (Join-Path $JavaHome 'bin/java.exe') ('@'+$javaArgs) *> $javaLog
    $testExit = $LASTEXITCODE
  } finally { Pop-Location }
  Get-Content -LiteralPath $javaLog -Tail 12
  if ($testExit -ne 0) { throw "Real Backend consumer failed; log: $javaLog" }
  Write-Output "PASS: isolated real Backend consumer; evidence: $evidencePath"
} finally {
  $env:POINTS_INTEGRATION_REDIS_PORT = $priorRedis
  foreach($container in $owned) { docker stop $container | Out-Null }
  [ordered]@{ runId=$runId; runtime=$runtime; containers=$owned; backendWorktreeWrites=$false; productionWrites=$false; databaseRetained=$true } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $miniRoot 'docs/operations/points-v1/backend-http-runtime.json')
}


