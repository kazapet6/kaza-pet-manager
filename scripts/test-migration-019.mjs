import { readFileSync } from 'node:fs'

const caminho018 = new URL(
  '../banco/018_confirmacao_transacional_rpc.sql',
  import.meta.url,
)
const caminho019 = new URL(
  '../banco/019_corrigir_rpc_confirmacao_ambiguidade.sql',
  import.meta.url,
)

const sql018 = readFileSync(caminho018, 'utf8').replaceAll('\r', '')
const sql019 = readFileSync(caminho019, 'utf8').replaceAll('\r', '')

const extrairFuncao = (sql) => {
  const inicio = sql.indexOf('create or replace function')
  const fim = sql.indexOf('\n$$;', inicio)
  if (inicio < 0 || fim < 0) throw new Error('Definicao da RPC ausente.')
  return sql.slice(inicio, fim + 4)
}

const funcao018 = extrairFuncao(sql018)
const funcao019 = extrairFuncao(sql019)
const corpoDeclare = funcao019.match(/\bdeclare\n([\s\S]*?)\nbegin\n/)?.[1] ?? ''
const declaracoes = [...corpoDeclare.matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s+/gm)]
  .map((item) => item[1])

const variaveis = [
  'grupo', 'atendimento', 'servicos', 'origens', 'acrescimos', 'etapas',
  'contribuicoes', 'funcionarios', 'equipamentos', 'supervisoes', 'esperas',
  'grupo_id', 'atendimento_id', 'chave_idempotencia', 'hash_requisicao',
  'versao_configuracao_plano', 'versao_configuracao_atual',
  'versao_ocupacao_atual', 'grupo_existente', 'atendimento_existente',
  'servico_legado_id', 'total_servicos', 'total_informado',
  'quantidade_solicitados', 'pai_incorreto', 'preco_incoerente',
  'referencia_invalida', 'duplicidade_invalida', 'elemento_invalido',
  'lock_recurso',
]

const normalizada019 = variaveis.reduce(
  (sql, nome) => sql.replaceAll(new RegExp(`\\bv_${nome}\\b`, 'g'), nome),
  funcao019,
)

const casos = [
  {
    nome: 'assinatura preservada',
    passou: funcao019.includes(
      'public.confirmar_agendamento_transacional(\n  p_plano jsonb\n)',
    ),
  },
  {
    nome: 'todas as variaveis locais usam prefixo v_',
    passou: declaracoes.length === variaveis.length
      && declaracoes.every((nome) => nome.startsWith('v_')),
  },
  {
    nome: 'consulta de idempotencia usa identificadores inequivocos',
    passou: funcao019.includes(
      'where item.chave_idempotencia = v_chave_idempotencia;',
    ) && !funcao019.includes(
      'where item.chave_idempotencia = chave_idempotencia;',
    ),
  },
  {
    nome: 'colunas persistidas nao foram renomeadas',
    passou: funcao019.includes(
      'chave_idempotencia, hash_requisicao, configuracao_versao',
    ) && !funcao019.includes(
      'v_chave_idempotencia, v_hash_requisicao, configuracao_versao\n    ) values',
    ),
  },
  {
    nome: 'nao depende de variable_conflict',
    passou: !sql019.includes('#variable_conflict'),
  },
  {
    nome: 'SECURITY DEFINER e search_path preservados',
    passou: funcao019.includes('security definer')
      && funcao019.includes('set search_path = pg_catalog'),
  },
  {
    nome: 'ACL preserva bloqueios e service_role',
    passou: sql019.includes('from public, anon, authenticated;')
      && sql019.includes('to service_role;'),
  },
  {
    nome: 'corpo permanece equivalente ao da 018',
    passou: normalizada019 === funcao018,
  },
]

let falhas = 0
for (const caso of casos) {
  console.log(`${caso.passou ? 'OK' : 'FALHA'} — ${caso.nome}`)
  if (!caso.passou) falhas += 1
}

if (falhas) process.exitCode = 1
