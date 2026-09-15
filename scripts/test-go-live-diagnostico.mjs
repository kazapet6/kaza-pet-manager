import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../banco/admin/go_live/01_diagnostico_pre_limpeza.sql', import.meta.url),
  'utf8',
).replaceAll('\r', '')
const manifestoSql = readFileSync(
  new URL('../banco/admin/go_live/00_manifesto.psql', import.meta.url),
  'utf8',
).replaceAll('\r', '')
const manifestoJson = JSON.parse(readFileSync(
  new URL('../banco/admin/go_live/manifesto_tabelas.json', import.meta.url),
  'utf8',
))

let total = 0
function teste(nome, executar) {
  executar()
  total += 1
  console.log(`OK GL${String(total).padStart(2, '0')} ${nome}`)
}

function entradas(sqlFonte, acoes) {
  return [...sqlFonte.matchAll(
    /^\s*\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)[,;]?$/gm,
  )]
    .map((match) => ({ nome: match[1], acao: match[2], classe: match[3] }))
    .filter((item) => acoes.includes(item.acao))
}

teste('consulta possui uma única saída tabular', () => {
  assert.equal((sql.match(/^select secao, objeto, valor_atual, valor_esperado, ok, detalhe$/gm) ?? []).length, 1)
  assert.equal((sql.match(/^from resultados$/gm) ?? []).length, 1)
  assert.equal((sql.match(/;\s*$/gm) ?? []).length, 3)
})

teste('transação é explicitamente somente leitura', () => {
  assert.match(sql, /^begin transaction isolation level repeatable read read only;$/m)
  assert.match(sql, /^rollback;$/m)
  const semComentarios = sql.replace(/^\s*--.*$/gm, '')
  const semStrings = semComentarios.replace(/'(?:''|[^'])*'/g, "''")
  assert.doesNotMatch(semStrings, /\b(create|insert|update|delete|truncate|alter|drop|grant|revoke)\b/i)
})

teste('inventário consolidado contém 68, 29 e 39 tabelas', () => {
  const itens = entradas(sql, ['limpar', 'preservar'])
  assert.equal(itens.length, 68)
  assert.equal(itens.filter((item) => item.acao === 'limpar').length, 29)
  assert.equal(itens.filter((item) => item.acao === 'preservar').length, 39)
  assert.equal(new Set(itens.map((item) => item.nome)).size, 68)
})

teste('inventário coincide com manifestos operacionais', () => {
  const diagnostico = entradas(sql, ['limpar', 'preservar']).map((item) => item.nome).sort()
  const psql = entradas(manifestoSql, ['truncar', 'apagar', 'preservar']).map((item) => item.nome).sort()
  const json = [...manifestoJson.transacionais, ...manifestoJson.preservadas]
    .map((item) => item.nome)
    .sort()
  assert.deepEqual(diagnostico, psql)
  assert.deepEqual(diagnostico, json)
})

teste('métricas obrigatórias do staging estão no único resultado', () => {
  for (const objeto of [
    'lotes_abertos',
    'clientes_staging',
    'clientes_importar',
    'clientes_ignorar',
    'pets_staging',
    'pets_importar',
    'pets_ignorar',
    'mapeamentos',
    'ids_promovidos',
    'linhas_ja_importado',
    'lotes_concluidos',
  ]) {
    assert.match(sql, new RegExp(`'staging', '${objeto}'`))
  }
})

teste('todas as contagens e assinaturas são consolidadas', () => {
  assert.match(sql, /query_to_xml\(/)
  assert.match(sql, /md5\(coalesce\(jsonb_agg\(to_jsonb\(x\)/)
  assert.match(sql, /'dados_operacionais'/)
  assert.match(sql, /'preservacao_estrutural'/)
})

teste('duas sequências são lidas sem consumir IDs', () => {
  assert.match(sql, /'clientes_codigo_seq', 'clientes'/)
  assert.match(sql, /'pets_codigo_seq', 'pets'/)
  assert.match(sql, /last_value/)
  assert.match(sql, /is_called/)
  assert.doesNotMatch(sql, /\bnextval\s*\(/i)
})

teste('segurança cobre auth, staging e ausência de cascade', () => {
  assert.match(sql, /'auth_no_escopo'/)
  assert.match(sql, /'importacao_no_conjunto_limpeza'/)
  assert.match(sql, /'acoes_cascade_no_manifesto'/)
})

console.log(`${total} testes do diagnóstico consolidado de go-live aprovados.`)
