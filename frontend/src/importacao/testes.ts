import assert from 'node:assert/strict'
import { CAMPOS_CLIENTES, CAMPOS_PETS, lerCSV, mapearEnum, resolverRaca, analisarVinculosDuplicidades } from './csv.ts'

let total = 0
function teste(nome: string, f: () => void) { f(); total++; console.log(`OK ${nome}`) }
const clientes = () => lerCSV('id;nome;telefone\na;José;\nb;Maria;123\nc;Ana;', CAMPOS_CLIENTES)
teste('ponto e vírgula, BOM, acentos, CRLF, aspas e quebra interna', () => {
  const r = lerCSV('\uFEFFid;nome;observacoes\r\na;José;"Banho; com ""cuidado""\namanhã"\r\n', CAMPOS_CLIENTES)
  assert.equal(r[0].valores.nome, 'José'); assert.equal(r[0].valores.observacoes, 'Banho; com "cuidado"\namanhã')
})
teste('campos vazios preservados sem defaults', () => {
  assert.equal(clientes()[0].valores.telefone, '')
  const p = lerCSV('id;nome;clienteId;castrado\np;Pet;a;', CAMPOS_PETS)
  assert.equal(p[0].valores.castrado, ''); assert.equal(mapearEnum('castrado', ''), null)
})
teste('credenciais e metadados antigos descartados', () => {
  const r = lerCSV('id;nome;senha;tokenSenha;tokenSenhaExpira;tokenVerificacao;emailVerificado;tenantId\na;Teste;segredo-teste;token-teste;data;token-teste;t;empresa', CAMPOS_CLIENTES)
  assert.deepEqual(Object.keys(r[0].valores), ['id', 'nome'])
  assert.doesNotMatch(JSON.stringify(r), /segredo-teste|token-teste|tenantId/)
})
teste('CSV malformado gera erro sem reproduzir conteúdo', () => {
  for (const s of ['id;nome\na;"aberto', 'id;id;nome\na;a;b', 'id;nome\na;b;c', 'id;nome\na;"b"c']) {
    assert.throws(() => lerCSV(s, CAMPOS_CLIENTES))
  }
  assert.throws(() => lerCSV('id;nome\np;Pet', CAMPOS_PETS))
})
teste('vários pets vinculados exclusivamente pelo ID, cliente sem pet', () => {
  const pets = lerCSV('id;nome;clienteId\np1;Pet 1;a\np2;Pet 2;a\np3;Pet 3;a\np4;Pet 4;b', CAMPOS_PETS)
  const r = analisarVinculosDuplicidades(clientes(), pets)
  assert.equal(r.vinculados, 4); assert.equal(r.semTutorResolvido, 0); assert.equal(r.clientes, 3)
})
teste('tutor inexistente ou vazio bloqueia', () => {
  const pets = lerCSV('id;nome;clienteId\np1;Pet;x\np2;Pet;', CAMPOS_PETS)
  const r = analisarVinculosDuplicidades(clientes(), pets)
  assert.equal(r.semTutorResolvido, 2); assert.equal(r.avisos.filter(a => a.bloqueante).length, 2)
})
teste('ID externo duplicado bloqueia relação ambígua', () => {
  const c = lerCSV('id;nome\na;Um\na;Dois', CAMPOS_CLIENTES)
  const p = lerCSV('id;nome;clienteId\np;Pet;a', CAMPOS_PETS)
  const r = analisarVinculosDuplicidades(c, p)
  assert.ok(r.avisos.some(a => a.codigo === 'TUTOR_AMBIGUO'))
  assert.equal(r.vinculados, 0)
})
teste('duplicidades de cliente e pet são sinalizadas, nunca fundidas', () => {
  const c = lerCSV('id;nome;telefone;email;cpf\na;José;123;a@exemplo.test;000\nb;José;123;A@exemplo.test;000', CAMPOS_CLIENTES)
  const p = lerCSV('id;nome;clienteId;raca\np;Pet;a;Raça\nq;Pet;a;Raça', CAMPOS_PETS)
  const r = analisarVinculosDuplicidades(c, p)
  for (const campo of ['cpf', 'telefone', 'email', 'nome+telefone', 'tutor+nome', 'tutor+nome+raca']) {
    assert.ok(r.avisos.some(a => a.campo === campo))
  }
  assert.equal(c.length, 2); assert.equal(p.length, 2)
})
teste('nome numérico é sinalizado sem corrigir', () => {
  const c = lerCSV('id;nome\na;123456', CAMPOS_CLIENTES)
  assert.ok(analisarVinculosDuplicidades(c, []).avisos.some(a => a.codigo === 'NOME_NUMERICO'))
  assert.equal(c[0].valores.nome, '123456')
})
teste('espécie e sexo inequívocos', () => {
  assert.equal(mapearEnum('especie', 'Cachorro'), 'cao'); assert.equal(mapearEnum('especie', 'Cão'), 'cao')
  assert.equal(mapearEnum('especie', 'Gato'), 'gato'); assert.equal(mapearEnum('genero', 'Fêmea'), 'femea')
  assert.equal(mapearEnum('genero', 'Macho'), 'macho'); assert.equal(mapearEnum('genero', ''), null)
})
teste('porte Micro não é arbitrariamente convertido para mini', () => {
  assert.equal(mapearEnum('tamanho', 'Micro'), null); assert.equal(mapearEnum('tamanho', 'Médio'), 'medio')
  assert.equal(mapearEnum('tamanho', 'Grande'), 'grande'); assert.equal(mapearEnum('tamanho', 'Gigante'), 'gigante')
})
teste('pelagem e castrado inequívocos', () => {
  assert.equal(mapearEnum('pelo', 'Curto'), 'curta'); assert.equal(mapearEnum('pelo', 'Médio'), 'media')
  assert.equal(mapearEnum('pelo', 'Longo'), 'longa'); assert.equal(mapearEnum('castrado', 'f'), false)
  assert.equal(mapearEnum('castrado', 't'), true)
})
teste('situação não possui equivalente confirmado', () => {
  for (const v of ['Ativo', 'Inativo', 'Bloqueado', '']) assert.equal(mapearEnum('situacao', v), null)
})
teste('raça exata normalizada, mesma espécie, única e ativa', () => {
  const r = [{ id: 'r1', especie: 'cao', nome: 'São-Bernardo', ativo: true }]
  assert.equal(resolverRaca(' sao  bernardo ', 'cao', r), 'r1')
  assert.equal(resolverRaca('São Bernardo', 'gato', r), null)
  assert.equal(resolverRaca('São Bernard', 'cao', r), null)
  assert.equal(resolverRaca('', 'cao', r), null)
  assert.equal(resolverRaca('São Bernardo', 'cao', [...r, { ...r[0], id: 'r2' }]), null)
  assert.equal(resolverRaca('São Bernardo', 'cao', [{ ...r[0], ativo: false }]), null)
})
console.log(`${total} testes locais de preparação CSV aprovados.`)
