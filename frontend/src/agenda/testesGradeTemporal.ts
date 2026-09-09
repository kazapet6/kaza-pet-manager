import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { alturaSegmento, densidadeSegmento, montarGrade, minutoLocal, possuiPacote } from './gradeTemporal.ts'
import { construirEntradaNovoAgendamento } from './novoAgendamento.ts'
import type { AgendaDiariaAtendimento, AgendaDiariaResultado } from '../types/AgendaDiaria.ts'
import type { EstruturaAgenda } from '../types/Agenda.ts'

const funcionarios = ['Ana','Bruna','Caio'].map((nome,i)=>({id:`f${i}`,nome,ativo:true,criadoEm:''}))
const estrutura = {funcionarios,funcionarioJornadas:funcionarios.map(f=>({id:f.id,funcionarioId:f.id,diaSemana:2,inicio:'09:00',fim:'18:00',ativo:true})),funcionarioIntervalos:[]} as unknown as EstruturaAgenda
const blocos = [{diaSemana:2,inicio:'09:00',fim:'18:00',ativo:true}]
const etapa = (id:string, funcionarioIds:string[], inicio='09:15', fim='09:45') => ({id,nome:id,ordem:1,inicio:`2026-09-08T${inicio}:00-03:00`,fim:`2026-09-08T${fim}:00-03:00`,funcionarios:funcionarios.filter(f=>funcionarioIds.includes(f.id)),equipamentos:[]})
const atendimento = (id:string, etapas=[etapa('banho',['f0'])], responsavel=funcionarios[0]):AgendaDiariaAtendimento => ({id,grupoId:'g',clienteId:'c',petId:'p',dataOperacional:'2026-09-08',inicio:etapas[0]?.inicio??'2026-09-08T09:15:00-03:00',conclusao:etapas.at(-1)?.fim??'2026-09-08T10:15:00-03:00',petNome:'Luna',tutorNome:'Tutor',servicos:[],status:'agendado',modalidade:'normal',observacoes:'',valorFinal:100,financeiro:null,vinculoContrato:null,historicoOperacional:[],preferenciaFuncionario:'obrigatorio',funcionarioPreferidoId:responsavel?.id??null,funcionarioResponsavelId:responsavel?.id??null,funcionarioResponsavel:responsavel??null,etapas,esperas:[],taxidog:null})
const agenda = (itens:AgendaDiariaAtendimento[]=[],data='2026-09-08'):AgendaDiariaResultado=>({dataOperacional:data,timezone:'America/Sao_Paulo',secoes:itens.length?[{chave:'legado',funcionario:funcionarios[2],atendimentos:itens}]:[]})
const fonteGrade = readFileSync(new URL('./GradeAgenda.tsx', import.meta.url),'utf8')
const cssAgenda = readFileSync(new URL('../App.css', import.meta.url),'utf8')
let total=0
function teste(nome:string, executar:()=>void){executar();total++;console.log(`✓ ${nome}`)}
teste('dia vazio mantém três colunas e expediente real',()=>{const g=montarGrade(agenda(),estrutura,blocos);assert.equal(g.colunas.length,3);assert.equal(g.inicio,540);assert.equal(g.fim,1080);assert.equal(g.atendimentos.length,0)})
teste('um e dois funcionários seguem jornadas, não número de atendimentos',()=>{for(const n of [1,2]) assert.equal(montarGrade(agenda(),{...estrutura,funcionarios:funcionarios.slice(0,n)},blocos).colunas.length,n)})
teste('inativo e sem jornada não são escalados por cadastro',()=>assert.equal(montarGrade(agenda(),{...estrutura,funcionarios:funcionarios.map(f=>({...f,ativo:false}))},blocos).colunas.length,0))
teste('dia fechado não inventa expediente nem horário 00:00',()=>{const g=montarGrade(agenda([],'2026-09-07'),estrutura,blocos);assert.equal(g.inicio,null);assert.equal(g.fim,null);assert.equal(g.colunas.length,0)})
teste('um atendimento ocupa somente a coluna do responsável autoritativo',()=>{const g=montarGrade(agenda([atendimento('a',[etapa('banho',['f0']),etapa('tosa',['f1'],'10:00','10:15')],funcionarios[2])]),estrutura,blocos);assert.equal(g.colunas[0].segmentos.length,0);assert.equal(g.colunas[1].segmentos.length,0);assert.equal(g.colunas[2].segmentos[0].atendimento.id,'a')})
teste('alocações internas não duplicam o card',()=>{const g=montarGrade(agenda([atendimento('a',[etapa('dupla',['f0','f1'])])]),estrutura,blocos);assert.equal(g.colunas.flatMap(c=>c.segmentos).length,1);assert.equal(g.atendimentos.length,1)})
teste('sem responsável fica na área própria mesmo com pessoa em etapa',()=>{const g=montarGrade(agenda([atendimento('a',[etapa('banho',['f0'])],null as never)]),estrutura,blocos);assert.equal(g.colunas.at(-1)?.nome,'Sem responsável')})
teste('15 minutos preservados na escala e na duração total',()=>{const g=montarGrade(agenda([atendimento('a',[etapa('curta',['f0'],'09:15','09:30')])]),estrutura,blocos);assert.equal(g.colunas[0].segmentos[0].inicio,555);assert.equal(g.colunas[0].segmentos[0].fim,570)})
teste('timezone não desloca horário efetivo nem usa coleta TaxiDog',()=>assert.equal(minutoLocal('2026-09-08T12:15:00Z','America/Sao_Paulo'),555))
teste('sobreposição real ganha trilhas distintas e sinalização',()=>{const g=montarGrade(agenda([atendimento('a'),atendimento('b')]),estrutura,blocos);assert.deepEqual(g.colunas[0].segmentos.map(s=>s.faixa),[0,1]);assert.ok(g.colunas[0].segmentos.every(s=>s.conflito))})
teste('etapas consecutivas reutilizam trilha sem conflito',()=>{const g=montarGrade(agenda([atendimento('a'),atendimento('b',[etapa('b',['f0'],'09:45','10:15')])]),estrutura,blocos);assert.deepEqual(g.colunas[0].segmentos.map(s=>s.faixa),[0,0]);assert.ok(g.colunas[0].segmentos.every(s=>!s.conflito))})
teste('cancelado não sinaliza conflito ativo',()=>{const b={...atendimento('b'),status:'cancelado'};assert.ok(montarGrade(agenda([atendimento('a'),b]),estrutura,blocos).colunas[0].segmentos.every(s=>!s.conflito))})
teste('avulso não recebe caixa por nome de pacote',()=>{const a={...atendimento('a'),petNome:'Pacote ouro'};assert.equal(possuiPacote(a),false)})
teste('caixa depende do vínculo contratual já validado pelo loader',()=>{const a=atendimento('a');a.vinculoContrato={contratoId:'c',pacoteNome:'Ouro',cicloId:'ci',cicloNumero:1,periodoInicio:'2026-09-08',periodoFim:'2026-09-30',ocorrenciaOrdem:1,totalOcorrencias:4};assert.equal(possuiPacote(a),true)})
teste('responsável escolhido é obrigatório para o Motor',()=>{const entrada=construirEntradaNovoAgendamento({petId:'p',servicoIds:['s'],data:'2026-09-08',modalidade:'sem_transporte',cicloTaxidogId:'',funcionarioResponsavelId:'f1'});assert.equal(entrada.preferenciaFuncionario,'obrigatorio');assert.equal(entrada.funcionarioPreferidoId,'f1')})
teste('dados originais e valor não são alterados pela visualização',()=>{const a=agenda([atendimento('a')]);const antes=JSON.stringify(a);montarGrade(a,estrutura,blocos);assert.equal(JSON.stringify(a),antes)})
teste('10, 15 e 20 minutos usam densidade curta sem deformar a altura',()=>{for(const duracao of [10,15,20]){const s={inicio:540,fim:540+duracao};assert.equal(densidadeSegmento(s),'curta');assert.equal(alturaSegmento(s),duracao*3.6-4)}})
teste('30 e 45 minutos usam densidade média',()=>{for(const duracao of [30,45])assert.equal(densidadeSegmento({inicio:540,fim:540+duracao}),'media')})
teste('60 minutos ou mais usam apresentação normal',()=>{for(const duracao of [60,90])assert.equal(densidadeSegmento({inicio:540,fim:540+duracao}),'normal')})
teste('card curto preserva horário, pet, serviços, vínculo e indicadores essenciais',()=>{for(const trecho of ['agenda-segmento-compacto-top','horario(s.inicio)','a.petNome','servicos','Atendimento de pacote','TaxiDog','agenda-status-ponto'])assert.ok(fonteGrade.includes(trecho),trecho)})
teste('card normal preserva tutor, serviços, transporte, status e valor',()=>{for(const trecho of ['a.tutorNome','agenda-segmento-servico','Sem transporte','agenda-status','agenda-segmento-valor'])assert.ok(fonteGrade.includes(trecho),trecho)})
teste('card continua clicável e ação rápida não propaga o clique',()=>{assert.ok(fonteGrade.includes('onClick={()=>abrir(a)}'));assert.ok(fonteGrade.includes('e.stopPropagation();acao(a)'))})
teste('card não possui overflow interno e conteúdo compacto usa elipse',()=>{const regra=cssAgenda.match(/\.agenda-segmento \{[^}]+\}/)?.[0]||'';assert.ok(regra.includes('overflow:hidden'));assert.ok(!regra.includes('overflow:auto'));assert.ok(cssAgenda.includes('text-overflow:ellipsis'))})
teste('densidade por largura não cria rolagem horizontal no card',()=>{assert.ok(cssAgenda.includes('container-type:inline-size'));assert.ok(cssAgenda.includes('@container (max-width:240px)'));assert.ok(!cssAgenda.includes('overflow-x:auto'))})
console.log(`${total} testes da grade temporal aprovados.`)
