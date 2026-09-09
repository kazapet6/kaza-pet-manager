import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ocorrenciasDoCiclo, type ItemRecorrente } from '../../../supabase/functions/_shared/recorrencia-contrato.ts'
import {
  diagnosticarInvariantesPlanoConfirmacao,
  montarPlanoConfirmacaoRpc,
  paiCanonicoPlano,
} from '../../../supabase/functions/_shared/confirmacao/plano.ts'
import type { ConfirmacaoAgendamentoIntent } from '../../../supabase/functions/_shared/confirmacao/contrato.ts'
import { resolverServicos } from '../../../supabase/functions/_shared/motor/regras.ts'
import { executarLeituraMaterializacao } from '../../../supabase/functions/_shared/materializacao-carregamento.ts'
import type {
  DadosDisponibilidade,
  EntradaDisponibilidade,
  OpcaoDisponibilidade,
  ResultadoPrecificacao,
} from '../../../supabase/functions/_shared/motor/tipos.ts'

const sql=readFileSync(new URL('../../../banco/031_materializacao_ciclos_agenda.sql',import.meta.url),'utf8')
const materializador=readFileSync(new URL('../../../supabase/functions/_shared/materializacao-ciclo.ts',import.meta.url),'utf8')
const carregadorMotor=readFileSync(new URL('../../../supabase/functions/_shared/motor/supabase.ts',import.meta.url),'utf8')
const venda=readFileSync(new URL('../../../supabase/functions/vender-contrato/servico.ts',import.meta.url),'utf8')
const agenda=readFileSync(new URL('../data/agendaDiaria.ts',import.meta.url),'utf8')
const remarcacao=readFileSync(new URL('../../../banco/023_remarcacao_transacional_atendimento.sql',import.meta.url),'utf8')
let total=0
async function teste(nome:string,executar:()=>void|Promise<void>){await executar();total+=1;console.log(`✓ ${nome}`)}
const banho:ItemRecorrente={servicoId:'banho',servicoNome:'Banho',quantidadePorCiclo:4,intervaloQuantidade:1,intervaloUnidade:'semana',offsetInicialQuantidade:0,offsetInicialUnidade:'dia'}
const hidratacao:ItemRecorrente={servicoId:'hidratacao',servicoNome:'Hidratação',quantidadePorCiclo:2,intervaloQuantidade:2,intervaloUnidade:'semana',offsetInicialQuantidade:0,offsetInicialUnidade:'dia'}
const ocorrencias=ocorrenciasDoCiclo([banho,hidratacao],'2026-09-04')

await teste('M01 uma ocorrência produz uma unidade temporal',()=>assert.equal(ocorrenciasDoCiclo([{...banho,quantidadePorCiclo:1}],'2026-09-04').length,1))
await teste('M02 retry reconhece vínculos existentes',()=>{assert.match(sql,/v_materializadas=v_total/);assert.match(sql,/'reutilizado',true/)})
await teste('M03 quatro ocorrências geram exatamente quatro atendimentos',()=>assert.equal(ocorrencias.length,4))
await teste('M04 Banho e Hidratação são agrupados na mesma ocorrência',()=>assert.deepEqual(ocorrencias.map(o=>o.itens.map(i=>i.servicoId)),[['banho','hidratacao'],['banho'],['banho','hidratacao'],['banho']]))
await teste('M05 dependência não cria atendimento extra',()=>assert.equal(ocorrencias.filter(o=>o.itens.some(i=>i.servicoId==='hidratacao')).length,2))
await teste('M06 quantidade fechada permanece autoritativa',()=>assert.equal(ocorrencias.flatMap(o=>o.itens).filter(i=>i.servicoId==='banho').length,4))
await teste('M07 quinta sexta não cria unidade extra',()=>assert.equal(ocorrencias.at(-1)?.data,'2026-09-25'))
await teste('M08 vínculo elimina ocupação virtual',()=>{assert.match(sql,/vincular_ocorrencia_ciclo_atendimento/);assert.match(carregadorMotor,/ocorrenciaContratoIdIgnorada/)})
await teste('M09 troca mantém capacidade e uma única versão transacional',()=>{assert.match(sql,/agenda:ocupacao/);assert.doesNotMatch(sql,/update public\.agenda_versao_ocupacao/)})
await teste('M10 Motor autoritativo mantém habilitações de funcionário',()=>{assert.match(materializador,/calcularDisponibilidade/);assert.match(materializador,/carregarDadosDisponibilidadeComCliente/)})
await teste('M11 equipamento ocupado continua no mesmo Motor',()=>assert.match(materializador,/calcularDisponibilidadeNoHorario/))
await teste('M12 TaxiDog preserva ciclo e execução efetiva',()=>{assert.match(materializador,/cicloTaxidogId/);assert.match(materializador,/inicioOperacional/)})
await teste('M13 remarcação preserva o mesmo atendimento vinculado',()=>{assert.match(remarcacao,/update public\.atendimentos/);assert.doesNotMatch(remarcacao,/update public\.contrato_ciclo_ocorrencias/)})
await teste('M14 requer_revisao não materializa',()=>assert.match(sql,/v_ciclo\.estado='requer_revisao'/))
await teste('M15 atendimento materializado usa carregamento oficial da Agenda',()=>assert.match(agenda,/from\('atendimentos'\)|from\("atendimentos"\)/))
await teste('M16 falha reverte o lote e retry é idempotente',()=>{assert.match(sql,/exception when sqlstate 'PCM01'/);assert.match(sql,/confirmar_agendamento_transacional/)})
await teste('M17 venda não informa sucesso total quando materialização falha',()=>{assert.match(venda,/materializacao_pendente/);assert.match(venda,/Agenda ainda não/)})
await teste('M18 E2E 4 Banhos + 2 Hidratações preserva quatro ocorrências às 09:00',()=>{
  const e2e=ocorrenciasDoCiclo([banho,hidratacao],'2026-09-02')
  assert.equal(9*60,540)
  assert.equal(e2e.length,4)
  assert.deepEqual(e2e.map(o=>o.itens.map(i=>i.servicoId)),[['banho','hidratacao'],['banho'],['banho','hidratacao'],['banho']])
  assert.equal(e2e.flatMap(o=>o.itens).filter(i=>i.servicoId==='banho').length,4)
  assert.equal(e2e.flatMap(o=>o.itens).filter(i=>i.servicoId==='hidratacao').length,2)
})
await teste('M19 serviço contratado que também é dependência permanece solicitado sem pai canônico',()=>{
  const servicos=resolverE2E(['banho','hidratacao'])
  const banhoResolvido=servicos.find(item=>item.id==='banho')!
  const hidratacaoResolvida=servicos.find(item=>item.id==='hidratacao')!
  assert.equal(banhoResolvido.origem,'solicitado')
  assert.deepEqual(banhoResolvido.paisDiretos,['hidratacao'])
  assert.equal(paiCanonicoPlano(banhoResolvido,[hidratacaoResolvida],new Map([['hidratacao','id-hidratacao']])),null)
})
await teste('M20 dependência automática continua exigindo pai canônico',()=>{
  const servicos=resolverE2E(['hidratacao'])
  const banhoResolvido=servicos.find(item=>item.id==='banho')!
  const hidratacaoResolvida=servicos.find(item=>item.id==='hidratacao')!
  assert.equal(banhoResolvido.origem,'dependencia')
  assert.equal(paiCanonicoPlano(banhoResolvido,[hidratacaoResolvida],new Map([['hidratacao','id-hidratacao']])), 'id-hidratacao')
})
await teste('M21 diagnóstico interno identifica exatamente pai indevido sem expor payload',()=>{
  assert.deepEqual(diagnosticarInvariantesPlanoConfirmacao({servicos:[{
    servico_id:'banho',origem:'solicitado',pai_canonico_id:'id-hidratacao',
  }]}),[{
    codigo:'SERVICO_SOLICITADO_COM_PAI_CANONICO',campo:'servicos[].pai_canonico_id',
    servicoId:'banho',esperado:'null',recebido:'uuid-presente',
  }])
})
await teste('M22 plano B+H passa pela invariante e preserva a aresta operacional',()=>{
  const servicos=resolverE2E(['banho','hidratacao'])
  const dados={
    configuracao:{timezone:'America/Sao_Paulo'},
    pets:[{id:'pet-e2e',clienteId:'cliente-e2e',nome:'PET TESTE E2E',especie:'cao',racaId:'raca',racaNome:'Teste',sexo:'macho',porte:'pequeno',pelagem:'curta',peso:10,temperamento:'calmo'}],
    etapas:[{id:'etapa-banho',ordem:1}],recursosEtapas:[],
  } as unknown as DadosDisponibilidade
  const opcao={
    horarioApresentado:540,inicioOperacional:540,conclusaoPrevista:615,cicloTaxidog:null,servicos,
    etapas:[{etapaId:'etapa-banho',servicoId:'banho',servicoNome:'Banho',nome:'Banho + Hidratação',inicio:540,fim:615,duracaoBaseMinutos:60,duracaoMinutos:75,funcionarios:[],equipamentos:[],modificadoresAplicados:[],contribuicoesAcopladas:[]}],
    esperas:[],duracaoProcessamento:75,tempoEspera:0,duracaoTotal:75,trocasFuncionario:0,trocasRecurso:0,
  } as OpcaoDisponibilidade
  const precificacao={
    servicos:servicos.map(item=>({servicoId:item.id,servicoNome:item.nome,origem:item.origem,ordem:item.ordem,paisDiretos:item.paisDiretos,precoBaseSnapshot:item.id==='banho'?50:0,acrescimos:[],valorCalculado:item.id==='banho'?50:0})),
    valorCalculadoAtendimento:50,
  } as ResultadoPrecificacao
  const intencao={
    chaveIdempotencia:'11111111-1111-4111-8111-111111111111',petId:'pet-e2e',servicoIds:['banho','hidratacao'],data:'2026-09-02',horarioEscolhido:540,modalidade:'sem_transporte',cicloTaxidogId:null,preferenciaFuncionario:'automatico',funcionarioPreferidoId:null,versaoConfiguracaoConsultada:1,versaoOcupacaoConsultada:1,
  } as ConfirmacaoAgendamentoIntent
  const plano=montarPlanoConfirmacaoRpc(intencao,dados,opcao,precificacao,'a'.repeat(64))
  assert.deepEqual(diagnosticarInvariantesPlanoConfirmacao(plano),[])
  const servicosPlano=plano.servicos as Record<string,unknown>[]
  assert.equal(servicosPlano.find(item=>item.servico_id==='banho')?.pai_canonico_id,null)
  assert.equal((plano.origens as unknown[]).length,1)
})
await teste('M23 PGRST303 no carregamento faz um único retry e preserva quatro ocorrências',async()=>{
  const quatroOcorrencias=ocorrencias.map((item,indice)=>({
    id:`ocorrencia-${indice+1}`,
    itens:item.itens.map((i)=>i.servicoId),
  }))
  let tentativas=0
  const logs:Record<string,unknown>[]=[]
  const resposta=await executarLeituraMaterializacao(
    async()=>{
      tentativas+=1
      if(tentativas===1)return{
        data:null,
        error:{code:'PGRST303',message:'JWT claims validation or parsing failed',details:null,hint:null},
        status:401,
      }
      return{data:quatroOcorrencias,error:null,status:200}
    },
    {cicloId:'ciclo-e2e',etapa:'carregar_ocorrencias'},
    (_nivel,dados)=>logs.push(dados),
  )
  assert.equal(tentativas,2)
  assert.equal(resposta.error,null)
  assert.equal(resposta.data?.length,4)
  assert.deepEqual(resposta.data?.map((item)=>item.itens),[['banho','hidratacao'],['banho'],['banho','hidratacao'],['banho']])
  assert.equal(new Set(resposta.data?.map((item)=>item.id)).size,4)
  assert.deepEqual(logs.map((item)=>item.evento),['materializacao_carregamento_erro','materializacao_carregamento_recuperado'])
  assert.equal((logs[0].error as Record<string,unknown>).code,'PGRST303')
  assert.equal(logs[0].status,401)
})
await teste('M24 erro estrutural não é mascarado nem repetido',async()=>{
  let tentativas=0
  const logs:Record<string,unknown>[]=[]
  const resposta=await executarLeituraMaterializacao(
    async()=>{
      tentativas+=1
      return{data:null,error:{code:'PGRST204',message:'Column not found',details:'campo inexistente',hint:'revise o select'},status:400}
    },
    {cicloId:'ciclo-e2e',etapa:'carregar_ocorrencias'},
    (_nivel,dados)=>logs.push(dados),
  )
  assert.equal(tentativas,1)
  assert.equal(resposta.error?.code,'PGRST204')
  assert.equal(logs.length,1)
  assert.deepEqual(logs[0].error,{code:'PGRST204',message:'Column not found',details:'campo inexistente',hint:'revise o select'})
})
await teste('M25 materialização exige e revalida o responsável padrão do Ciclo',()=>{assert.match(materializador,/funcionario_responsavel_padrao_id/);assert.match(materializador,/preferenciaFuncionario: 'obrigatorio'/);assert.match(materializador,/funcionarioResponsavelId/)})
console.log(`${total} testes de materialização passaram.`)

function resolverE2E(servicoIds:string[]){
  const entrada={servicoIds} as EntradaDisponibilidade
  const dados={
    servicos:[
      {id:'banho',nome:'Banho',ativo:true},
      {id:'hidratacao',nome:'Hidratação',ativo:true},
    ],
    dependencias:[
      {servicoId:'hidratacao',dependenciaServicoId:'banho',ativo:true},
    ],
  } as DadosDisponibilidade
  return resolverServicos(entrada,dados)
}
