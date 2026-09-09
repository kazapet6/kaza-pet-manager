import assert from 'node:assert/strict'
import fs from 'node:fs'
import { criarHandlerStatus } from '../../../supabase/functions/alterar-status-atendimento/handler.ts'
import { STATUS_ATENDIMENTO, STATUS_OPERACIONAIS_EDITAVEIS, lerAlterarStatusIntent, type AlterarStatusIntent, type AlterarStatusResposta, type StatusAtendimento } from './contrato.ts'
import { podeEditarStatus, podeExecutarAcaoExcepcional, rotuloStatusAtendimento, statusDaAcaoExcepcional } from './politica.ts'
import { statusBloqueiaDisponibilidade } from '../motorDisponibilidade/supabase.ts'

let aprovados = 0
async function teste(codigo: string, nome: string, executar: () => void | Promise<void>) { await executar(); aprovados++; console.log(`${codigo} — ${nome}: OK`) }
const migration020 = fs.readFileSync(new URL('../../../banco/020_status_operacional_atendimentos.sql', import.meta.url), 'utf8')
const migration021 = fs.readFileSync(new URL('../../../banco/021_flexibilizar_status_operacional_atendimentos.sql', import.meta.url), 'utf8')
const migration022 = fs.readFileSync(new URL('../../../banco/022_cancelamento_falta_atendimentos.sql', import.meta.url), 'utf8')
const migration032 = fs.readFileSync(new URL('../../../banco/032_ciclo_vida_creditos_contrato.sql', import.meta.url), 'utf8')
const agenda = fs.readFileSync(new URL('../pages/Agenda.tsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const cliente = fs.readFileSync(new URL('./clienteSupabase.ts', import.meta.url), 'utf8')
const servico = fs.readFileSync(new URL('../../../supabase/functions/alterar-status-atendimento/servico.ts', import.meta.url), 'utf8')

await teste('SA01', 'nove status persistidos continuam reconhecidos', () => assert.equal(STATUS_ATENDIMENTO.length, 9))
await teste('SA02', 'sete status operacionais formam lista fechada', () => assert.deepEqual([...STATUS_OPERACIONAIS_EDITAVEIS], ['agendado', 'confirmado', 'recebido', 'em_atendimento', 'aguardando_retirada', 'aguardando_entrega', 'concluido']))
for (const [codigo, origem, destino] of [
  ['SA03', 'agendado', 'confirmado'], ['SA04', 'agendado', 'recebido'],
  ['SA05', 'agendado', 'em_atendimento'], ['SA06', 'agendado', 'concluido'],
  ['SA07', 'confirmado', 'concluido'], ['SA08', 'recebido', 'concluido'],
  ['SA09', 'em_atendimento', 'recebido'], ['SA10', 'aguardando_retirada', 'concluido'],
  ['SA11', 'aguardando_entrega', 'concluido'],
] as const) await teste(codigo, `${origem} pode mudar para ${destino}`, () => assert.ok(podeEditarStatus(origem) && podeEditarStatus(destino)))
await teste('SA12', 'concluído exige reversão administrativa na Agenda', () => assert.ok(agenda.includes("status !== 'concluido' && podeEditarStatus(status)")))
await teste('SA13', 'cancelado não é editável', () => assert.equal(podeEditarStatus('cancelado'), false))
await teste('SA14', 'faltou não é editável', () => assert.equal(podeEditarStatus('faltou'), false))
await teste('SA15', 'frontend não consegue enviar status arbitrário', () => assert.equal(lerAlterarStatusIntent({ atendimentoId: 'a', statusEsperado: 'agendado', novoStatus: 'inventado' }), null))
await teste('SA16', 'contrato aceita somente novo status fechado', () => assert.deepEqual(lerAlterarStatusIntent({ atendimentoId: 'a', statusEsperado: 'agendado', novoStatus: 'concluido' })?.novoStatus, 'concluido'))
await teste('SA17', 'RPC condiciona atualização ao status esperado', () => assert.ok(servico.includes("rpc('alterar_status_atendimento_com_creditos'") && migration032.includes('v_atendimento.status<>v_esperado')))
await teste('SA18', 'RPC aplica política conforme ação recebida', () => assert.ok(migration032.includes("v_acao='registrar_falta'") && migration032.includes("v_acao='cancelar'")))
await teste('SA19', 'reativação conflitante vira conflito de domínio', () => assert.ok(migration032.includes('when raise_exception or check_violation') && migration020.includes('revalidar_reservas_ao_ativar_atendimento')))
await teste('SA20', 'timestamps preservam primeira ocorrência', () => assert.ok(migration021.includes('coalesce(old.recebido_em') && migration021.includes('coalesce(old.iniciado_em') && migration021.includes('coalesce(old.finalizado_em') && migration021.includes('coalesce(old.concluido_em')))
await teste('SA21', 'migration 020 permanece histórica e 021 substitui política', () => assert.ok(migration020.includes('v_transicao_valida') && migration021.includes('v_status_operacionais constant text[]')))
await teste('SA22', 'todos os bloqueantes permanecem bloqueantes', () => { for (const status of ['agendado', 'confirmado', 'recebido', 'em_atendimento', 'aguardando_retirada', 'aguardando_entrega']) assert.equal(statusBloqueiaDisponibilidade(status), true) })
await teste('SA23', 'terminais continuam liberando ocupação', () => { for (const status of ['concluido', 'cancelado', 'faltou']) assert.equal(statusBloqueiaDisponibilidade(status), false) })
await teste('SA24', 'modal usa sete cards em uma linha no desktop', () => assert.ok(agenda.includes('className="agenda-status-opcoes"') && agenda.includes('opcoesStatusOperacional.map') && !agenda.includes('<select') && !agenda.includes('<i aria-hidden="true" />{opcao.rotulo}') && agenda.includes("status === opcao.valor && <span aria-hidden=\"true\">✓</span>") && css.includes('.agenda-status-operacional { display: grid; gap: 7px; padding: 0; background: transparent; }') && css.includes('grid-template-columns: .88fr 1fr .82fr 1.22fr 1.58fr 1.55fr .86fr') && css.includes('height: 48px') && css.includes('white-space: nowrap')))
await teste('SA25', 'processamento fica no card clicado e bloqueia os demais', () => assert.ok(agenda.includes('disabled={atualizando}') && agenda.includes('statusAtualizando === opcao.valor') && agenda.includes('agenda-status-spinner') && agenda.includes('Atualizando...') && !agenda.includes('agenda-status-atualizando')))
await teste('SA26', 'reload usa loader normal', () => assert.ok(agenda.includes('carregarAgendaDiaria(supabase, atendimento.dataOperacional)')))
await teste('SA27', 'card usa exclusivamente status carregado', () => assert.ok(agenda.includes('<Status valor={atendimento.status} />')))
await teste('SA28', 'TaxiDog permanece badge separado', () => assert.ok(agenda.includes("atendimento.modalidade === 'taxidog' && <span className=\"agenda-taxidog\"")))
await teste('SA29', 'frontend usa Edge sem update direto', () => assert.ok(cliente.includes("functions.invoke('alterar-status-atendimento'") && !agenda.includes(".from('atendimentos').update")))
await teste('SA30', 'paleta cobre todos os status', () => STATUS_ATENDIMENTO.forEach((status) => assert.ok(css.includes(`.status-${status}`))))
await teste('SA31', 'rótulo confirmado preserva semântica', () => assert.equal(rotuloStatusAtendimento('confirmado'), 'Confirmado'))
await teste('SA32', 'conflito tem mensagem operacional', () => assert.ok(agenda.includes('Não foi possível alterar o status porque a disponibilidade operacional mudou.')))
await teste('SA33', 'erro técnico é sanitizado', () => assert.ok(agenda.includes('Não foi possível atualizar o atendimento. Tente novamente.')))

function handlerCom(usuario: { id: string; app_metadata?: Record<string, unknown> } | null, resposta?: AlterarStatusResposta) { return criarHandlerStatus({ validarToken: async () => usuario, alterar: async () => resposta ?? { status: 'invalido', codigo: 'TRANSICAO_INVALIDA', mensagem: 'inválida' } }, new Set(['http://localhost:5173'])) }
const intencao: AlterarStatusIntent = { atendimentoId: 'a', statusEsperado: 'agendado', novoStatus: 'concluido' }
const requisicao = (corpo: unknown = intencao) => new Request('http://local', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json', origin: 'http://localhost:5173' }, body: JSON.stringify(corpo) })
await teste('SA34', 'token ausente retorna 401', async () => assert.equal((await handlerCom(null)(new Request('http://local', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))).status, 401))
await teste('SA35', 'usuário não internal retorna 403', async () => assert.equal((await handlerCom({ id: 'u', app_metadata: {} })(requisicao())).status, 403))
await teste('SA36', 'Edge rejeita status desconhecido', async () => assert.equal((await handlerCom({ id: 'u', app_metadata: { role: 'internal' } })(requisicao({ atendimentoId: 'a', statusEsperado: 'agendado', novoStatus: 'x' }))).status, 400))
await teste('SA37', 'internal recebe resposta tipada', async () => { const resposta: AlterarStatusResposta = { status: 'atualizado', atendimentoId: 'a', statusAnterior: 'agendado', statusAtual: 'concluido', reutilizado: false }; assert.equal((await handlerCom({ id: 'u', app_metadata: { role: 'internal' } }, resposta)(requisicao())).status, 200) })

for (const [codigo, origem] of [
  ['SA38', 'agendado'], ['SA39', 'confirmado'], ['SA40', 'recebido'],
  ['SA41', 'em_atendimento'], ['SA42', 'aguardando_retirada'],
  ['SA43', 'aguardando_entrega'],
] as const) await teste(codigo, `${origem} pode ser cancelado`, () => assert.equal(podeExecutarAcaoExcepcional(origem, 'cancelar'), true))
for (const [codigo, origem, esperado] of [
  ['SA44', 'agendado', true], ['SA45', 'confirmado', true],
  ['SA46', 'recebido', false], ['SA47', 'em_atendimento', false],
  ['SA48', 'aguardando_retirada', false], ['SA49', 'aguardando_entrega', false],
  ['SA50', 'concluido', false],
] as const) await teste(codigo, `${origem} respeita política de falta`, () => assert.equal(podeExecutarAcaoExcepcional(origem, 'registrar_falta'), esperado))
await teste('SA51', 'concluido não pode ser cancelado', () => assert.equal(podeExecutarAcaoExcepcional('concluido', 'cancelar'), false))
await teste('SA52', 'cancelado e faltou são terminais', () => { for (const status of ['cancelado', 'faltou'] as StatusAtendimento[]) for (const acao of ['cancelar', 'registrar_falta'] as const) assert.equal(podeExecutarAcaoExcepcional(status, acao), false) })
await teste('SA53', 'ações excepcionais têm destinos fechados', () => { assert.equal(statusDaAcaoExcepcional('cancelar'), 'cancelado'); assert.equal(statusDaAcaoExcepcional('registrar_falta'), 'faltou') })
await teste('SA54', 'contrato aceita ações conhecidas e rejeita ação arbitrária', () => { assert.ok(lerAlterarStatusIntent({ atendimentoId: 'a', statusEsperado: 'agendado', acao: 'cancelar' })); assert.equal(lerAlterarStatusIntent({ atendimentoId: 'a', statusEsperado: 'agendado', acao: 'excluir' }), null) })
await teste('SA55', 'migration 022 preserva histórico e restringe transições', () => assert.ok(migration022.includes("old.status in ('cancelado', 'faltou')") && migration022.includes("old.status not in ('agendado', 'confirmado')") && migration022.includes('v_origens_cancelamento')))
await teste('SA56', 'interface exige confirmação sem alert nativo', () => assert.ok(agenda.includes('Cancelar atendimento?') && agenda.includes('Registrar falta?') && agenda.includes('Confirmar cancelamento') && agenda.includes('Confirmar falta') && !agenda.includes('window.confirm') && !agenda.includes('window.alert')))
await teste('SA57', 'ações ficam agrupadas à esquerda do rodapé sem seção própria', () => assert.ok(agenda.includes('<footer>') && agenda.includes('className="agenda-rodape-acoes"') && !agenda.includes('Ações do atendimento') && !agenda.includes('agenda-acoes-excepcionais') && css.includes('justify-content: space-between') && css.includes('margin-left: auto')))
await teste('SA58', 'duplo clique é bloqueado durante ação excepcional', () => assert.ok(agenda.includes('|| emAndamento.current) return') && agenda.includes('disabled={atualizando}')))
await teste('SA59', 'processamento excepcional é localizado', () => assert.ok(agenda.includes('acaoAtualizando === confirmacao') && agenda.includes('agenda-status-spinner')))
await teste('SA60', 'cancelado e faltou mantêm cores semânticas', () => assert.ok(css.includes('.status-cancelado') && css.includes('.status-faltou')))
await teste('SA61', 'reservas históricas não são apagadas', () => assert.ok(!servico.includes('.delete(') && !migration022.toLowerCase().includes('delete from')))
await teste('SA62', 'recebido registra somente recebido_em', () => assert.ok(/if new\.status = 'recebido'[\s\S]*?new\.recebido_em := coalesce\(old\.recebido_em, statement_timestamp\(\)\)/.test(migration022)))
await teste('SA63', 'em atendimento registra somente iniciado_em', () => assert.ok(/elsif new\.status = 'em_atendimento'[\s\S]*?new\.iniciado_em := coalesce\(old\.iniciado_em, statement_timestamp\(\)\)/.test(migration022)))
await teste('SA64', 'ambos estados de espera registram finalizado_em', () => assert.ok(migration022.includes("new.status in ('aguardando_retirada', 'aguardando_entrega')") && migration022.includes('new.finalizado_em := coalesce(old.finalizado_em, statement_timestamp())')))
await teste('SA65', 'concluído registra somente concluido_em sem inventar intermediários', () => assert.ok(/elsif new\.status = 'concluido' then\s+new\.concluido_em := coalesce\(old\.concluido_em, statement_timestamp\(\)\)/.test(migration022)))
await teste('SA66', 'primeiras ocorrências são preservadas em regressões e novas passagens', () => ['recebido', 'iniciado', 'finalizado', 'concluido'].forEach((campo) => assert.ok(migration022.includes(`coalesce(old.${campo}_em`))))
await teste('SA67', 'cancelamento e falta não fabricam timestamps', () => { const blocoTimestamps = migration022.slice(migration022.indexOf("if new.status = 'recebido'")); assert.ok(!blocoTimestamps.includes("new.status = 'cancelado'") && !blocoTimestamps.includes("new.status = 'faltou'")) })
await teste('SA68', 'horário real usa relógio autoritativo do banco', () => assert.ok(migration022.includes('statement_timestamp()') && !servico.includes('new Date(')))

console.log(`${aprovados} testes SA01–SA68 aprovados.`)
