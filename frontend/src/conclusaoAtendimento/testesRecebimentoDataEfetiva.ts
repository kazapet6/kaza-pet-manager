import assert from 'node:assert/strict'
import { dataEfetivaValida, hojeFinanceiro, lerConclusaoDadosIntent, type ConclusaoDadosIntent } from './contrato.ts'
import { criarHandlerDadosConclusao } from '../../../supabase/functions/dados-conclusao-atendimento/handler.ts'
import { executarDadosConclusaoBackend } from '../../../supabase/functions/dados-conclusao-atendimento/servico.ts'

let n = 0
async function teste(nome: string, executar: () => void | Promise<void>) {
  await executar(); console.log(`RF${String(++n).padStart(2,'0')} OK — ${nome}`)
}
const base = { operacao: 'receber', atendimentoId: 'a1', chaveIdempotencia: 'key', valor: 176, formaPagamento: 'pix', dataEfetiva: '2026-10-29' } as const
const passado = '2000-02-29'
await teste('data bissexta válida', () => assert.equal(dataEfetivaValida(passado, '2026-11-26'), true))
await teste('dia inexistente rejeitado', () => assert.equal(dataEfetivaValida('2025-02-29', '2026-11-26'), false))
await teste('mês inexistente rejeitado', () => assert.equal(dataEfetivaValida('2026-13-01', '2026-11-26'), false))
await teste('data futura rejeitada', () => assert.equal(dataEfetivaValida('2026-11-27', '2026-11-26'), false))
await teste('data do dia aceita', () => assert.equal(dataEfetivaValida('2026-11-26', '2026-11-26'), true))
await teste('timezone de Contagem não usa dia UTC prematuro', () => assert.equal(hojeFinanceiro(new Date('2026-11-27T01:30:00Z')), '2026-11-26'))
await teste('data vazia, ano zero e formato ambíguo rejeitados', () => ['', '0000-01-01', '29/10/2026', '2026-1-2', null].forEach(d=>assert.equal(dataEfetivaValida(d),false)))
await teste('contrato de intenção mantém data efetiva', () => assert.deepEqual(lerConclusaoDadosIntent({...base, dataEfetiva: passado}), {...base,dataEfetiva:passado}))
await teste('cliente legado continua aceito sem data', () => { const {dataEfetiva,...rest}=base; assert.deepEqual(lerConclusaoDadosIntent(rest),rest) })
await teste('intenção rejeita data e valor inválidos', () => {assert.equal(lerConclusaoDadosIntent({...base,dataEfetiva:'2025-02-29'}),null);assert.equal(lerConclusaoDadosIntent({...base,dataEfetiva:passado,valor:Infinity}),null)})
await teste('identidade vem do JWT, não do payload', async () => {
  let operador=''; let recebido: ConclusaoDadosIntent|undefined
  const h=criarHandlerDadosConclusao({validarToken:async()=>({id:'operador-autenticado',app_metadata:{role:'internal'}}), executar:async(i,id)=>{operador=id;recebido=i;return {status:'registrado'}}},new Set())
  const r=await h(new Request('https://teste.invalid',{method:'POST',headers:{authorization:'Bearer ficticio'},body:JSON.stringify({...base,dataEfetiva:passado,usuarioId:'forjado'})}))
  assert.equal(r.status,200); assert.equal(operador,'operador-autenticado'); assert.ok(recebido && !('usuarioId' in recebido))
})
await teste('JWT não interno rejeitado', async () => {
  const h=criarHandlerDadosConclusao({validarToken:async()=>({id:'operador',app_metadata:{role:'external'}}),executar:async()=>{throw new Error('não deveria executar')}},new Set())
  const r=await h(new Request('https://teste.invalid',{method:'POST',headers:{authorization:'Bearer ficticio'},body:JSON.stringify({...base,dataEfetiva:passado})}));assert.equal(r.status,403)
})
async function encaminhar(pacote: boolean, i: ConclusaoDadosIntent) {
 const chamadas: {nome:string;payload:unknown}[]=[]
 const admin={rpc:async(nome:string,payload:unknown)=>{chamadas.push({nome,payload});return {data:nome==='financeiro_pacote_056'?(pacote?{cicloId:'c',valor:176,situacao:'pendente',recebimento:null}:null):{status:'registrado',recebimentoId:'r'},error:null}}}
 const resultado=await executarDadosConclusaoBackend(i,admin as never,'operador')
 return {chamadas,resultado}
}
await teste('pacote datado usa RPC nova e mantém valor integral',async()=>{const {chamadas}=await encaminhar(true,{...base,dataEfetiva:passado});assert.equal(chamadas[1].nome,'receber_pacote_056');assert.deepEqual(chamadas[1].payload,{p_payload:{...base,dataEfetiva:passado,usuarioId:'operador'}})})
await teste('adicional datado não quita pacote',async()=>{const {chamadas}=await encaminhar(true,{...base,dataEfetiva:passado,destino:'adicionais',valor:60});assert.equal(chamadas[1].nome,'registrar_recebimento_atendimento_056');assert.equal((chamadas[1].payload as {p_payload:{valor:number}}).p_payload.valor,60)})
await teste('avulso datado conserva caminho separado',async()=>{const {chamadas}=await encaminhar(false,{...base,dataEfetiva:passado,valor:55});assert.equal(chamadas[1].nome,'registrar_recebimento_atendimento_056')})
await teste('adicional não pode ser recebido fora de pacote',async()=>{const {chamadas,resultado}=await encaminhar(false,{...base,dataEfetiva:passado,destino:'adicionais'});assert.equal(chamadas.length,1);assert.equal(resultado.status,'invalido')})
await teste('compatibilidade com RPC legada',async()=>{const {dataEfetiva,...rest}=base;const {chamadas}=await encaminhar(true,rest);assert.equal(chamadas[1].nome,'receber_pacote_045')})
console.log(`${n} testes de contrato/roteamento passaram. PostgreSQL e interface real não foram executados.`)
