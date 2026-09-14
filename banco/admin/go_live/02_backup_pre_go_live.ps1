param([Parameter(Mandatory=$true)][string]$Destino)
$ErrorActionPreference='Stop'
# Manual, não chamado pela aplicação. Credenciais em PGSERVICE/PGPASSFILE fora do Git.
if (-not $env:PGSERVICE) { throw 'Configure PGSERVICE apontando para o projeto explicitamente revisado.' }
foreach ($cmd in @('pg_dump','pg_restore')) { Get-Command $cmd -ErrorAction Stop | Out-Null }
$raiz=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$saida=[IO.Path]::GetFullPath($Destino)
if ($saida -eq $raiz -or $saida.StartsWith($raiz+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
  throw 'Backup deve ficar em armazenamento privado fora do repositório.'
}
if (Test-Path -LiteralPath $saida) { throw 'Use um diretório novo para não sobrescrever backups.' }
if ($env:GO_LIVE_MANUTENCAO -ne 'CONFIRMADA') { throw 'Confirme a suspensão de TODOS os escritores com GO_LIVE_MANUTENCAO=CONFIRMADA.' }
New-Item -ItemType Directory -Path $saida | Out-Null
$m=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'manifesto_tabelas.json')|ConvertFrom-Json
# A janela de manutenção deve estar ativa antes de iniciar e durar até o pós-limpeza.
$backupCompleto=Join-Path $saida 'public-completo.dump'
& pg_dump --format=custom --schema=public --file $backupCompleto
if ($LASTEXITCODE -ne 0) { throw 'Backup completo falhou. Limpeza proibida.' }
$argsDump=@('--format=custom','--data-only',('--file='+ (Join-Path $saida 'transacionais.dump')))
foreach($t in $m.transacionais){$argsDump+=('--table=public.'+$t.nome)}
& pg_dump @argsDump
if ($LASTEXITCODE -ne 0) { throw 'Backup transacional falhou. Limpeza proibida.' }
foreach($nome in @('public-completo.dump','transacionais.dump')) {
  & pg_restore --list (Join-Path $saida $nome) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Arquivo de backup ilegível. Limpeza proibida.' }
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'manifesto_tabelas.json') -Destination $saida
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $saida 'public-completo.dump'),(Join-Path $saida 'transacionais.dump') |
  Select-Object Algorithm,Hash,Path | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $saida 'sha256.json')
'Backups gerados. Validar restauração em ambiente isolado antes de autorizar limpeza.'
