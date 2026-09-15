import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarTravaSubmissaoPet } from './submissaoPet.ts'

let total = 0
async function teste(nome: string, executar: () => void | Promise<void>) {
  await executar()
  total += 1
  console.log(`OK SP${String(total).padStart(2, '0')} ${nome}`)
}
function pendente<T>() {
  let resolver!: (valor: T) => void
  const promessa = new Promise<T>((resolve) => { resolver = resolve })
  return { promessa, resolver }
}

await teste('duplo clique executa um único INSERT', async () => {
  const trava = criarTravaSubmissaoPet(); const espera = pendente<void>(); let inserts = 0
  const inserir = () => { inserts += 1; return espera.promessa }
  const primeiro = trava.executar(inserir); const segundo = await trava.executar(inserir)
  assert.deepEqual(segundo, { executado: false }); assert.equal(inserts, 1)
  espera.resolver(); await primeiro
})

await teste('Enter e clique simultâneos compartilham a mesma trava', async () => {
  const trava = criarTravaSubmissaoPet(); const espera = pendente<void>(); let requisicoes = 0
  const enviar = () => { requisicoes += 1; return espera.promessa }
  const enter = trava.executar(enviar); const clique = trava.executar(enviar)
  assert.equal((await clique).executado, false); assert.equal(requisicoes, 1)
  espera.resolver(); await enter
})

await teste('sucesso permanece travado até o formulário ser encerrado', async () => {
  const trava = criarTravaSubmissaoPet(); let sucessos = 0
  const resultado = await trava.executar(async () => 'PET-1')
  if (resultado.executado) sucessos += 1
  assert.equal(sucessos, 1); assert.equal(trava.ativa(), true)
  assert.equal((await trava.executar(async () => 'PET-2')).executado, false)
  trava.liberar(); assert.equal(trava.ativa(), false)
})

await teste('erro libera nova tentativa sem bloquear o formulário', async () => {
  const trava = criarTravaSubmissaoPet(); let tentativas = 0
  await assert.rejects(trava.executar(async () => { tentativas += 1; throw new Error('rede') }))
  const nova = await trava.executar(async () => { tentativas += 1; return 'PET-1' })
  assert.equal(nova.executado, true); assert.equal(tentativas, 2)
})

await teste('edição executa um único UPDATE', async () => {
  const trava = criarTravaSubmissaoPet(); const espera = pendente<void>(); let updates = 0
  const atualizar = () => { updates += 1; return espera.promessa }
  const primeiro = trava.executar(atualizar); const duplicado = await trava.executar(atualizar)
  assert.equal(duplicado.executado, false); assert.equal(updates, 1)
  espera.resolver(); await primeiro
})

await teste('formulário usa trava imediata, botão desabilitado e estado visual', () => {
  const pagina = readFileSync(new URL('../pages/Pets.tsx', import.meta.url), 'utf8')
  assert.match(pagina, /useRef\(criarTravaSubmissaoPet\(\)\)/)
  assert.match(pagina, /if \(travaSubmissao\.current\.ativa\(\)\) return/)
  assert.match(pagina, /disabled=\{salvando\}/)
  assert.match(pagina, /salvando \? 'Salvando\.\.\.'/)
})

console.log(`${total} testes de submissão de Pets aprovados.`)
