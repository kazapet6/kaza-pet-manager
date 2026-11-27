import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calcularHashRemarcacao, lerRemarcacaoIntent, validarRemarcacaoIntent, type RemarcacaoIntent } from './contrato.ts'
import { criarHandlerRemarcacao } from '../../../supabase/functions/remarcar-atendimento/handler.ts'

const u=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const base:RemarcacaoIntent={chaveIdempotencia:u(1),atendimentoId:u(2),grupoAgendamentoIdEsperado:u(3),statusEsperado:'agendado',inicioOperacionalEsperado:'2026-12-01T12:00:00Z',funcionarioResponsavelIdEsperado:u(4),funcionarioResponsavelId:u(4),data:'2026-12-01',horarioEscolhido:540,modalidade:'sem_transporte',cicloTaxidogId:null,versaoConfiguracaoConsultada:1,versaoOcupacaoConsultada:2}
const retirada={...base,removerAdicionalId:u(5)}
let n=0
async function teste(nome:string,fn:()=>unknown|Promise<unknown>){await fn();console.log(`PASS ${++n} ${nome}`)}
await teste('intenção de retirada válida',()=>assert.deepEqual(lerRemarcacaoIntent(retirada),retirada))
await teste('ID inválido rejeitado',()=>assert.equal(lerRemarcacaoIntent({...retirada,removerAdicionalId:'invalid'}),null))
await teste('adição e retirada não podem coexistir',()=>assert.equal(lerRemarcacaoIntent({...retirada,adicional:{servicoId:u(6),valor:60,original:60}}),null))
await teste('validação tipada também rejeita conflito',()=>assert.equal(validarRemarcacaoIntent({...retirada,adicional:{servicoId:u(6),valor:60,original:60}}),false))
await teste('hash inclui serviço retirado',async()=>assert.notEqual(await calcularHashRemarcacao(retirada),await calcularHashRemarcacao({...retirada,removerAdicionalId:u(6)})))
await teste('hash distingue retirada de remarcação comum',async()=>assert.notEqual(await calcularHashRemarcacao(retirada),await calcularHashRemarcacao(base)))
await teste('hash não muda com chave de retry',async()=>assert.equal(await calcularHashRemarcacao(retirada),await calcularHashRemarcacao({...retirada,chaveIdempotencia:u(10)})))
let chamada: {item:RemarcacaoIntent; operadorId?:string}|undefined
const handler=criarHandlerRemarcacao({validarToken:async t=>t==='interno'?{id:u(99),app_metadata:{role:'internal'}}:t==='sem-id'?{app_metadata:{role:'internal'}}:t==='externo'?{id:u(98),app_metadata:{role:'external'}}:null,remarcar:async(item,operadorId)=>{chamada={item,operadorId};return{status:'remarcado',codigo:'REMARCADO',atendimentoId:item.atendimentoId,grupoAgendamentoId:item.grupoAgendamentoIdEsperado,funcionarioResponsavelId:item.funcionarioResponsavelId,dataOperacional:item.data,horarioConfirmado:540,conclusaoPrevista:598,versaoOcupacao:3,reutilizadoPorIdempotencia:false}}},new Set())
const request=(token:string,body:unknown)=>handler(new Request('http://localhost',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)}))
await teste('JWT inválido rejeitado',async()=>assert.equal((await request('invalid',retirada)).status,401))
await teste('externo rejeitado',async()=>assert.equal((await request('externo',retirada)).status,403))
await teste('operador sem ID não pode retirar',async()=>assert.equal((await request('sem-id',retirada)).status,403))
await teste('operador é o autenticado, não o informado no corpo',async()=>{assert.equal((await request('interno',{...retirada,usuarioId:u(88),operadorId:u(88)})).status,200);assert.equal(chamada?.operadorId,u(99));assert.deepEqual(chamada?.item,retirada)})
await teste('remarcação comum continua compatível',async()=>{assert.equal((await request('interno',base)).status,200);assert.equal(chamada?.item.removerAdicionalId,undefined)})
const edge=readFileSync(new URL('../../../supabase/functions/remarcar-atendimento/servico.ts',import.meta.url),'utf8')
const modal=readFileSync(new URL('../agenda/RemarcarAtendimentoModal.tsx',import.meta.url),'utf8')
await teste('backend usa flags autoritativas e recalcula serviços restantes',()=>{assert.match(edge,/item\.adicional_pacote === true/);assert.match(edge,/restantes\.filter/);assert.match(edge,/new Map\(restantes\.map/);assert.match(edge,/remover_adicional_pacote_058/)})
await teste('interface não confunde banho contratado com adicional',()=>assert.match(modal,/item\.adicionalPacote && !item\.contratado/))
await teste('interface desmarca inclusão quando escolhe retirada',()=>assert.match(modal,/setRemoverId\(retirada\); setAdicionalId\(''\)/))
console.log(`${n} testes de retirada de adicional aprovados.`)
