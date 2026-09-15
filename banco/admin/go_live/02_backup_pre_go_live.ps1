param([Parameter(Mandatory = $true)][string]$Destino)
$ErrorActionPreference = 'Stop'

# Manual, não chamado pela aplicação. Credenciais ficam em PGSERVICE/PGPASSFILE.
if (-not $env:PGSERVICE) {
  throw 'Configure PGSERVICE apontando para o projeto explicitamente revisado.'
}
foreach ($comando in @('psql', 'pg_dump', 'pg_restore')) {
  Get-Command $comando -ErrorAction Stop | Out-Null
}

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$saida = [IO.Path]::GetFullPath($Destino)
if (
  $saida -eq $raiz -or
  $saida.StartsWith($raiz + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
) {
  throw 'Backup deve ficar em armazenamento privado fora do repositório.'
}
if (Test-Path -LiteralPath $saida) {
  throw 'Use um diretório novo para não sobrescrever backups.'
}
if ($env:GO_LIVE_MANUTENCAO -ne 'CONFIRMADA') {
  throw 'Confirme a suspensão de TODOS os escritores com GO_LIVE_MANUTENCAO=CONFIRMADA.'
}

$manifesto = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'manifesto_tabelas.json') |
  ConvertFrom-Json
$transacionais = @($manifesto.transacionais | ForEach-Object { $_.nome })
$staging = @($manifesto.preservadas |
  Where-Object { $_.classe -eq 'importacao_staging' } |
  ForEach-Object { $_.nome })
$todas = @($transacionais + ($manifesto.preservadas | ForEach-Object { $_.nome }) |
  Sort-Object -Unique)

if ($todas.Count -ne 68 -or $transacionais.Count -ne 29 -or $staging.Count -ne 4) {
  throw 'Manifesto 001-039 incompatível: esperadas 68 tabelas, 29 operacionais e 4 de staging.'
}

New-Item -ItemType Directory -Path $saida | Out-Null

# Evidência agregada sem PII: destino, contagens e estado do staging.
$identidade = & psql -X --no-psqlrc --tuples-only --no-align --command "select json_build_object('database',current_database(),'user',current_user,'server',inet_server_addr(),'port',inet_server_port())::text"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar identidade do banco.' }
$identidade | Set-Content -Encoding utf8 -LiteralPath (Join-Path $saida 'identidade_banco.json')

$consultaContagens = ($todas | ForEach-Object {
  "select '$($_)' as tabela, count(*) as total from public.$($_)"
}) -join ' union all '
$contagens = & psql -X --no-psqlrc --csv --command ($consultaContagens + ' order by tabela')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar contagens pré-limpeza.' }
$contagens | Set-Content -Encoding utf8 -LiteralPath (Join-Path $saida 'contagens_pre_limpeza.csv')

$consultaAssinaturas = ($manifesto.preservadas | ForEach-Object {
  "select '$($_.nome)' as tabela, count(*) as total, md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb)::text) as assinatura from public.$($_.nome) x"
}) -join ' union all '
$assinaturas = & psql -X --no-psqlrc --csv --command ($consultaAssinaturas + ' order by tabela')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar assinaturas das tabelas preservadas.' }
$assinaturas | Set-Content -Encoding utf8 -LiteralPath (Join-Path $saida 'assinaturas_preservadas.csv')

$consultaStaging = @"
select 'lotes' as objeto, status as detalhe, count(*) as total
from public.importacao_lotes group by status
union all
select 'clientes', decisao_operador || '/' || status_validacao, count(*)
from public.importacao_clientes_staging group by decisao_operador,status_validacao
union all
select 'pets', decisao_operador || '/' || status_validacao, count(*)
from public.importacao_pets_staging group by decisao_operador,status_validacao
union all
select 'mapeamentos', tipo_entidade, count(*)
from public.importacao_mapeamentos group by tipo_entidade
order by objeto,detalhe
"@
$resumoStaging = & psql -X --no-psqlrc --csv --command $consultaStaging
if ($LASTEXITCODE -ne 0) { throw 'Falha ao registrar resumo do staging.' }
$resumoStaging | Set-Content -Encoding utf8 -LiteralPath (Join-Path $saida 'staging_pre_limpeza.csv')

$backupCompleto = Join-Path $saida 'public-completo.dump'
& pg_dump --format=custom --schema=public --file $backupCompleto
if ($LASTEXITCODE -ne 0) { throw 'Backup completo do schema public falhou.' }

$argumentosTransacionais = @(
  '--format=custom',
  '--data-only',
  ('--file=' + (Join-Path $saida 'operacionais.dump'))
)
foreach ($tabela in $transacionais) {
  $argumentosTransacionais += ('--table=public.' + $tabela)
}
& pg_dump @argumentosTransacionais
if ($LASTEXITCODE -ne 0) { throw 'Backup dos dados operacionais falhou.' }

$argumentosStaging = @(
  '--format=custom',
  '--data-only',
  ('--file=' + (Join-Path $saida 'staging.dump'))
)
foreach ($tabela in $staging) {
  $argumentosStaging += ('--table=public.' + $tabela)
}
& pg_dump @argumentosStaging
if ($LASTEXITCODE -ne 0) { throw 'Backup dedicado do staging falhou.' }

foreach ($nome in @('public-completo.dump', 'operacionais.dump', 'staging.dump')) {
  & pg_restore --list (Join-Path $saida $nome) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Arquivo de backup ilegível: $nome" }
}

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'manifesto_tabelas.json') -Destination $saida
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '01_diagnostico_pre_limpeza.sql') -Destination $saida
Get-FileHash -Algorithm SHA256 -LiteralPath (
  (Join-Path $saida 'public-completo.dump'),
  (Join-Path $saida 'operacionais.dump'),
  (Join-Path $saida 'staging.dump'),
  (Join-Path $saida 'contagens_pre_limpeza.csv'),
  (Join-Path $saida 'assinaturas_preservadas.csv'),
  (Join-Path $saida 'staging_pre_limpeza.csv')
) | Select-Object Algorithm, Hash, Path |
  ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $saida 'sha256.json')

'Backups e evidências gerados. Restauração isolada continua obrigatória antes da limpeza.'
