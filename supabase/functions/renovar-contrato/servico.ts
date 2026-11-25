import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { objeto, uuid, type IntencaoRenovacao, type RespostaRenovacao, type PreparoRenovacao } from '../_shared/contrato-renovacao.ts'
import { validarDiaAncora } from '../_shared/contrato-venda.ts'
import { materializarCiclo } from '../_shared/materializacao-ciclo.ts'
import { planejarRenovacao } from './planejamento.ts'
type L = Record<string, unknown>
type Assinador = { assinar(payload: L): Promise<PreparoRenovacao>; verificar(preparo: PreparoRenovacao): Promise<boolean> }
type Deps = { planejar: typeof planejarRenovacao; materializar: typeof materializarCiclo }
const padrao: Deps = { planejar: planejarRenovacao, materializar: materializarCiclo }

export async function executarRenovacao(i: IntencaoRenovacao, usuarioId: string, admin: SupabaseClient, assinador: Assinador, deps: Deps = padrao, automatica = false): Promise<RespostaRenovacao> {
  if (i.operacao === 'preparar') {
    const [{ data: contrato, error: ec }, { data: ciclo, error: eci }, { data: resumo, error: er }, { data: recibo, error: eri }] = await Promise.all([
      admin.from('contratos').select('id,pet_id,status').eq('id', i.contratoId).single(),
      admin.from('contrato_ciclos').select('id,contrato_id,estado,numero,funcionario_responsavel_padrao_id,dia_semana_pretendido,horario_pretendido,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido').eq('id', i.cicloAnteriorId).eq('contrato_id', i.contratoId).single(),
      admin.rpc('resumo_comercial_contrato_043', { p_contrato_id: i.contratoId }),
      admin.from('contrato_renovacoes_idempotentes_043').select('chave_idempotencia').eq('chave_idempotencia', i.chaveIdempotencia).maybeSingle(),
    ])
    if (ec || eci || er || eri) throw new Error('Leitura de renovação indisponível.')
    if (recibo) return falha('conflito', 'TENTATIVA_JA_REGISTRADA', 'Retome a confirmação da mesma tentativa ou consulte o ciclo já criado.')
    const prova = Array.isArray(resumo) ? resumo.find((x: L) => x.ciclo_id === i.cicloAnteriorId) : null
    if (!contrato || contrato.status !== 'ativo' || !ciclo || ciclo.contrato_id !== i.contratoId || !prova?.comercialmente_concluido || !prova.elegivel_renovacao) return falha('invalido', 'CICLO_NAO_ELEGIVEL_COMERCIALMENTE', 'O ciclo ainda não pode ser renovado. Confira créditos, decisões e histórico.')
    if (!uuid(ciclo.funcionario_responsavel_padrao_id)) return falha('invalido', 'RESPONSAVEL_NAO_DEFINIDO', 'O ciclo precisa de um responsável válido antes da renovação.')
    if (!validarDiaAncora(i.dataAncora, Number(ciclo.dia_semana_pretendido))) return falha('invalido', 'ANCORA_INCOMPATIVEL', 'A primeira data deve corresponder ao dia da rotina contratada.')
    const antes = await versoes(admin)
    const plano = await deps.planejar(contrato as L, ciclo as L, i.dataAncora, admin)
    const depois = await versoes(admin)
    if (antes.configuracao !== depois.configuracao || antes.ocupacao !== depois.ocupacao) return falha('conflito', 'DISPONIBILIDADE_ALTERADA', 'A Agenda mudou durante a preparação. Consulte novamente antes de confirmar.')
    const payload = { contratoId: i.contratoId, cicloAnteriorId: i.cicloAnteriorId, chaveIdempotencia: i.chaveIdempotencia, usuarioId, renovacaoManual: !automatica, dataAncora: i.dataAncora, diaSemanaFixo: Number(ciclo.dia_semana_pretendido), horarioFixo: String(ciclo.horario_pretendido).slice(0, 5), modalidadeTransporte: ciclo.modalidade_transporte_pretendida, taxidogCicloId: ciclo.taxidog_ciclo_id_pretendido ?? null, funcionarioResponsavelId: ciclo.funcionario_responsavel_padrao_id, configuracaoAgendaVersao: antes.configuracao, ocupacaoAgendaVersao: antes.ocupacao, disponivel: plano.disponivel, ocorrencias: plano.ocorrencias, motivoRevisao: plano.motivoRevisao }
    return { status: 'preparado', preparo: await assinador.assinar(payload), disponivel: plano.disponivel, quantidadeOcorrencias: plano.ocorrencias.length, mensagem: plano.disponivel ? 'Rotina preparada. A elegibilidade e as reservas serão revalidadas na confirmação.' : 'Sem capacidade: a confirmação criará um ciclo que requer revisão, sem agendamentos.' }
  }

  if (!await assinador.verificar(i.preparo)) return falha('invalido', 'PREPARO_INVALIDO', 'A preparação não é válida. Nenhuma renovação foi confirmada.')
  let payload: unknown
  try { payload = JSON.parse(i.preparo.conteudo) } catch { return falha('invalido', 'PREPARO_INVALIDO', 'Preparação inválida.') }
  if (!objeto(payload) || payload.usuarioId !== usuarioId || !uuid(payload.contratoId) || !uuid(payload.cicloAnteriorId) || !uuid(payload.chaveIdempotencia)) return falha('invalido', 'PREPARO_INVALIDO', 'A preparação pertence a outra sessão ou contém identidade inválida.')
  // O recibo apenas escolhe o caminho de retry. Quem compara hash e identidade é a RPC, sob lock.
  const { data: recibo, error: eri } = await admin.from('contrato_renovacoes_idempotentes_043').select('chave_idempotencia').eq('chave_idempotencia', payload.chaveIdempotencia).maybeSingle()
  if (eri) throw new Error('Não foi possível conferir a tentativa.')
  if (!recibo) {
    const atual = await versoes(admin)
    if (payload.configuracaoAgendaVersao !== atual.configuracao || (payload.disponivel === true && payload.ocupacaoAgendaVersao !== atual.ocupacao)) return falha('conflito', 'DISPONIBILIDADE_ALTERADA', 'A Agenda mudou. Não houve confirmação de sucesso; revise a rotina antes de uma nova intenção.')
  }
  const { data: resultado, error } = await admin.rpc('renovar_ciclo_contrato', { p_intencao: payload })
  if (error) {
    if (['55P03', '40P01'].includes(error.code)) return falha('conflito', error.code, 'Outra operação está alterando este contrato. Retome a mesma tentativa, sem trocar a chave.')
    if (error.code === '42501') return falha('invalido', 'SEM_PERMISSAO', 'A renovação não foi autorizada.')
    if (['23P01', '23514', 'P0001'].includes(error.code)) return falha('conflito', 'RESERVA_NAO_CONFIRMADA', 'Não foi possível confirmar a reserva. Consulte a Agenda e o contrato; nenhum sucesso foi informado.')
    throw new Error('Resultado da renovação não confirmado.')
  }
  if (!objeto(resultado) || !['reservado', 'requer_revisao'].includes(String(resultado.status)) || !uuid(resultado.cicloId) || !Number.isSafeInteger(resultado.numero) || Number(resultado.numero) < 1) {
    if (objeto(resultado) && ['invalido', 'conflito', 'sem_renovacao'].includes(String(resultado.status))) return falha(resultado.status === 'conflito' ? 'conflito' : 'invalido', String(resultado.codigo ?? 'RENOVACAO_NAO_AUTORIZADA'), 'A renovação foi recusada. Confira a conclusão comercial, a identidade da tentativa e as condições do contrato.')
    throw new Error('Resposta da renovação não reconhecida.')
  }
  const base = { contratoId: payload.contratoId, cicloId: resultado.cicloId, numero: Number(resultado.numero) }
  if (resultado.status === 'requer_revisao') return { ...base, status: 'requer_revisao', mensagem: 'Novo ciclo criado para revisão de horário. Nenhum agendamento foi reservado.' }
  // O COMMIT da renovação já ocorreu. Falha posterior nunca é apresentada como rollback da renovação.
  try {
    const materializacao = await deps.materializar(base.cicloId, usuarioId, admin)
    return materializacao.status === 'materializado'
      ? { ...base, status: 'renovado', materializacao, mensagem: 'Novo ciclo criado e atendimentos preparados na Agenda.' }
      : { ...base, status: 'materializacao_pendente', materializacao, mensagem: 'Novo ciclo criado; a Agenda ainda está pendente. Retome a mesma tentativa para preparar os atendimentos.' }
  } catch {
    return { ...base, status: 'materializacao_pendente', mensagem: 'Novo ciclo criado; não foi possível confirmar sua Agenda. Retome a mesma tentativa.' }
  }
}

export async function renovarAutomaticamente(cicloId: string, usuarioId: string, admin: SupabaseClient, assinador: Assinador) {
  const { data: ciclo, error } = await admin.from('contrato_ciclos')
    .select('contrato_id,estado,situacao_financeira,dia_semana_pretendido,contratos(renovacao_automatica,timezone_snapshot,valor_contratado)')
    .eq('id', cicloId).single()
  if (error) throw error
  const contrato = Array.isArray(ciclo.contratos) ? ciclo.contratos[0] : ciclo.contratos
  if (!contrato?.renovacao_automatica || ciclo.estado !== 'concluido' ||
    (Number(contrato.valor_contratado) > 0 && ciclo.situacao_financeira !== 'pago')) return

  const { data: recibo, error: erroRecibo } = await admin.from('contrato_renovacoes_idempotentes_043')
    .select('ciclo_sucessor_id,resposta').eq('ciclo_anterior_id', cicloId).maybeSingle()
  if (erroRecibo) throw erroRecibo
  if (recibo) {
    if (recibo.resposta?.status === 'reservado') await confirmarMaterializacaoAutomatica(recibo.ciclo_sucessor_id, usuarioId, admin)
    return
  }
  const { data: ultima, error: erroData } = await admin.from('contrato_creditos_contexto_044')
    .select('data_atual').eq('ciclo_id', cicloId).not('data_atual', 'is', null).order('data_atual', { ascending: false }).limit(1).maybeSingle()
  if (erroData || !ultima) throw new Error('Última data operacional do ciclo indisponível.')
  const { data: ocorrencias, error: erroOcorrencias } = await admin.from('contrato_ciclo_ocorrencias')
    .select('data_operacional').eq('ciclo_id', cicloId).order('data_operacional')
  if (erroOcorrencias || !ocorrencias.length) throw new Error('Rotina original do ciclo indisponível.')
  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: contrato.timezone_snapshot }).format(new Date())
  const dataAncora = proximaAncora(ocorrencias.map(o => o.data_operacional), ultima.data_atual, hoje)
  const intencao = { operacao: 'preparar' as const, contratoId: ciclo.contrato_id, cicloAnteriorId: cicloId, chaveIdempotencia: cicloId, dataAncora }
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const preparo = await executarRenovacao(intencao, usuarioId, admin, assinador, padrao, true)
    if (preparo.status !== 'preparado') {
      if (!('codigo' in preparo)) throw new Error('Resultado inesperado da preparação.')
      if (preparo.codigo === 'DISPONIBILIDADE_ALTERADA') continue
      if (preparo.codigo === 'CICLO_NAO_ELEGIVEL_COMERCIALMENTE' || preparo.codigo === 'TENTATIVA_JA_REGISTRADA') return
      throw new Error(preparo.codigo)
    }
    const resultado = await executarRenovacao({ operacao: 'confirmar', preparo: preparo.preparo }, usuarioId, admin, assinador)
    if (resultado.status === 'renovado' || resultado.status === 'requer_revisao') return
    if (resultado.status === 'conflito' && resultado.codigo === 'DISPONIBILIDADE_ALTERADA') continue
    if (resultado.status === 'materializacao_pendente') await confirmarMaterializacaoAutomatica(resultado.cicloId, usuarioId, admin)
    else if ('codigo' in resultado && resultado.codigo !== 'IDEMPOTENCIA_CONFLITANTE') throw new Error(resultado.codigo)
    return
  }
  throw new Error('A Agenda mudou durante a renovação automática.')
}

async function confirmarMaterializacaoAutomatica(cicloId: string, usuarioId: string, admin: SupabaseClient) {
  const resultado = await materializarCiclo(cicloId, usuarioId, admin)
  if (resultado.status !== 'materializado') throw new Error('A Agenda do ciclo sucessor permanece pendente.')
}

export function proximaAncora(rotina: string[], ultima: string, hoje: string) {
  const dia = 86_400_000
  const planejadas = [...new Set(rotina)].map(data => Date.parse(`${data}T00:00:00Z`))
  const intervalos = planejadas.slice(1).map((data, i) => data - planejadas[i])
  const uniforme = intervalos[0] > 0 && intervalos.every(i => i === intervalos[0])
  const intervalo = uniforme ? intervalos[0] : 7 * dia
  const fimPlanejado = planejadas[planejadas.length - 1]
  const limite = Math.max(Date.parse(ultima) + dia, Date.parse(hoje))
  const passos = Math.max(1, Math.ceil((limite - fimPlanejado) / intervalo))
  return new Date(fimPlanejado + passos * intervalo).toISOString().slice(0, 10)
}
async function versoes(admin: SupabaseClient) {
  const [{ data: c, error: ec }, { data: o, error: eo }] = await Promise.all([admin.from('agenda_versao_configuracao').select('versao').eq('id', true).single(), admin.from('agenda_versao_ocupacao').select('versao').eq('id', true).single()])
  if (ec || eo || !c || !o || !Number.isSafeInteger(Number(c.versao)) || !Number.isSafeInteger(Number(o.versao))) throw new Error('Versões da Agenda indisponíveis.')
  return { configuracao: Number(c.versao), ocupacao: Number(o.versao) }
}
function falha(status: 'invalido' | 'conflito', codigo: string, mensagem: string): RespostaRenovacao { return { status, codigo, mensagem } }
