import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from '../../../frontend/src/motorDisponibilidade/motor.ts'
import { carregarDadosDisponibilidadeComCliente } from '../../../frontend/src/motorDisponibilidade/supabase.ts'
import { calcularHashRemarcacao, type RemarcacaoIntent, type RemarcacaoResposta } from '../../../frontend/src/remarcacao/contrato.ts'
import { montarPlanoRemarcacaoRpc } from '../../../frontend/src/remarcacao/plano.ts'

type Linha = Record<string, unknown>
export async function remarcarComBackendConfiavel(intencao: RemarcacaoIntent, admin: SupabaseClient): Promise<RemarcacaoResposta> {
  const hash = await calcularHashRemarcacao(intencao)
  const idempotencia = await admin.from('atendimento_remarcacoes').select('hash_requisicao, resposta').eq('chave_idempotencia', intencao.chaveIdempotencia).maybeSingle()
  if (idempotencia.error) throw idempotencia.error
  if (idempotencia.data) {
    if (idempotencia.data.hash_requisicao !== hash) return { status: 'conflito', codigo: 'IDEMPOTENCIA_CONFLITANTE', mensagem: 'A chave ja foi usada em outra remarcacao.' }
    return traduzir({ ...(idempotencia.data.resposta as Linha), reutilizadoPorIdempotencia: true }, null, intencao.modalidade)
  }
  const [configuracao, ocupacao, atendimentoResposta, funcionarioResposta] = await Promise.all([
    admin.from('agenda_versao_configuracao').select('versao').eq('id', true).single(),
    admin.from('agenda_versao_ocupacao').select('versao').eq('id', true).single(),
    admin.from('atendimentos').select('id, grupo_agendamento_id, pet_id, status, inicio_operacional_planejado, funcionario_responsavel_id, grupo:grupos_agendamento!inner(id, modalidade)').eq('id', intencao.atendimentoId).single(),
    admin.from('funcionarios').select('id, ativo').eq('id', intencao.funcionarioResponsavelId).eq('ativo', true).maybeSingle(),
  ])
  if (configuracao.error) throw configuracao.error
  if (ocupacao.error) throw ocupacao.error
  if (atendimentoResposta.error) return invalida('Atendimento nao encontrado.')
  if (funcionarioResposta.error || !funcionarioResposta.data) return invalida('Escolha um funcionário responsável ativo.')
  const versaoConfiguracao = Number(configuracao.data.versao); const versaoOcupacao = Number(ocupacao.data.versao)
  if (intencao.versaoConfiguracaoConsultada !== versaoConfiguracao) return { status: 'configuracao_alterada', codigo: 'CONFIGURACAO_ALTERADA', mensagem: 'A configuracao da agenda mudou. Consulte novamente.', versaoConfiguracaoAtual: versaoConfiguracao }
  const atendimento = atendimentoResposta.data as unknown as Linha
  if (!['agendado', 'confirmado'].includes(String(atendimento.status))) return { status: 'invalido', codigo: 'STATUS_NAO_PERMITE_REMARCACAO', mensagem: 'O status atual nao permite remarcacao.' }
  const grupo = (Array.isArray(atendimento.grupo) ? atendimento.grupo[0] : atendimento.grupo) as Linha
  if (String(atendimento.grupo_agendamento_id) !== intencao.grupoAgendamentoIdEsperado
    || String(atendimento.status) !== intencao.statusEsperado
    || new Date(String(atendimento.inicio_operacional_planejado)).toISOString() !== new Date(intencao.inicioOperacionalEsperado).toISOString()
    || nuloOuTexto(atendimento.funcionario_responsavel_id) !== intencao.funcionarioResponsavelIdEsperado) {
    return { status: 'conflito', codigo: 'ATENDIMENTO_ALTERADO', mensagem: 'O atendimento foi alterado desde a abertura da remarcacao.' }
  }
  const modalidadeAtual = String(grupo.modalidade) === 'taxidog' ? 'taxidog' : 'sem_transporte'
  if (modalidadeAtual !== intencao.modalidade) return invalida('A modalidade original deve ser preservada.')
  const servicosResposta = await admin.from('atendimento_servicos').select('id, servico_id, origem').eq('atendimento_id', intencao.atendimentoId)
  if (servicosResposta.error) throw servicosResposta.error
  const servicos = (servicosResposta.data ?? []) as unknown as Linha[]
  const solicitados = servicos.filter((item) => item.origem === 'solicitado').map((item) => String(item.servico_id))
  const entrada = { petId: String(atendimento.pet_id), servicoIds: solicitados, data: intencao.data,
    preferenciaFuncionario: 'obrigatorio' as const,
    funcionarioPreferidoId: intencao.funcionarioResponsavelId,
    tipoPlanejamento: 'normal' as const, modalidade: intencao.modalidade, cicloTaxidogId: intencao.cicloTaxidogId }
  const dados = await carregarDadosDisponibilidadeComCliente(entrada, admin, undefined, intencao.atendimentoId)
  const resultado = intencao.modalidade === 'taxidog' ? calcularDisponibilidade(entrada, dados) : calcularDisponibilidadeNoHorario(entrada, dados, intencao.horarioEscolhido!)
  const opcao = resultado.opcoes[0]
  if (!opcao) return { status: 'disponibilidade_alterada', codigo: intencao.modalidade === 'taxidog' ? 'CICLO_TAXIDOG_INVALIDO' : 'HORARIO_INDISPONIVEL', mensagem: resultado.motivos[0] ?? 'A nova programacao nao esta mais disponivel.', versaoOcupacaoAtual: versaoOcupacao }
  const mapa = new Map(servicos.map((item) => [String(item.servico_id), String(item.id)]))
  if (opcao.servicos.length !== mapa.size || opcao.servicos.some((item) => !mapa.has(item.id))) return invalida('Os servicos atuais nao correspondem ao plano recalculado.')
  const plano = montarPlanoRemarcacaoRpc(intencao, dados, opcao, mapa, hash)
  const { data, error } = await admin.rpc('remarcar_atendimento_transacional', { p_plano: plano })
  if (error) { console.error({ evento: 'remarcacao_rpc_erro', codigo: error.code, mensagem: error.message, details: error.details, hint: error.hint, chaveIdempotencia: intencao.chaveIdempotencia, atendimentoId: intencao.atendimentoId }); throw error }
  return traduzir(data, opcao, intencao.modalidade)
}
function traduzir(valor: unknown, opcao: ReturnType<typeof calcularDisponibilidade>['opcoes'][number] | null, modalidade: RemarcacaoIntent['modalidade']): RemarcacaoResposta {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Resposta invalida da RPC de remarcacao.')
  const item = valor as Linha
  if (item.status === 'remarcado') return { status: 'remarcado', codigo: 'REMARCADO', atendimentoId: String(item.atendimentoId), grupoAgendamentoId: String(item.grupoAgendamentoId), funcionarioResponsavelId: String(item.funcionarioResponsavelId), dataOperacional: String(item.dataOperacional), horarioConfirmado: Number(item.horarioConfirmado ?? opcao?.horarioApresentado ?? 0), conclusaoPrevista: Number(item.conclusaoPrevista ?? opcao?.conclusaoPrevista ?? 0), versaoOcupacao: Number(item.versaoOcupacao), reutilizadoPorIdempotencia: Boolean(item.reutilizadoPorIdempotencia) }
  if (item.codigo === 'IDEMPOTENCIA_CONFLITANTE') return { status: 'conflito', codigo: 'IDEMPOTENCIA_CONFLITANTE', mensagem: String(item.mensagem) }
  if (item.codigo === 'ATENDIMENTO_ALTERADO') return { status: 'conflito', codigo: 'ATENDIMENTO_ALTERADO', mensagem: String(item.mensagem) }
  if (item.codigo === 'CONFIGURACAO_ALTERADA') return { status: 'configuracao_alterada', codigo: 'CONFIGURACAO_ALTERADA', mensagem: String(item.mensagem), versaoConfiguracaoAtual: Number(item.versaoConfiguracaoAtual ?? 0) }
  if (item.codigo === 'CONFLITO_RECURSO') return { status: 'disponibilidade_alterada', codigo: modalidade === 'taxidog' ? 'CICLO_TAXIDOG_INVALIDO' : 'HORARIO_INDISPONIVEL', mensagem: String(item.mensagem), versaoOcupacaoAtual: Number(item.versaoOcupacaoAtual ?? 0) }
  if (item.codigo === 'STATUS_NAO_PERMITE_REMARCACAO') return { status: 'invalido', codigo: 'STATUS_NAO_PERMITE_REMARCACAO', mensagem: String(item.mensagem) }
  return invalida(String(item.mensagem || 'Plano de remarcacao invalido.'))
}
function invalida(mensagem: string): RemarcacaoResposta { return { status: 'invalido', codigo: 'INTENCAO_INVALIDA', mensagem } }
function nuloOuTexto(valor: unknown) { return valor == null ? null : String(valor) }
