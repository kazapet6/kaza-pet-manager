import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { executarLeituraMaterializacao } from './materializacao-carregamento.ts'
import { calcularHashIntencao, type ConfirmacaoAgendamentoIntent } from './confirmacao/contrato.ts'
import {
  diagnosticarInvariantesPlanoConfirmacao,
  montarPlanoConfirmacaoRpc,
} from './confirmacao/plano.ts'
import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from './motor/motor.ts'
import { calcularPrecificacao } from './motor/precificacao.ts'
import { carregarDadosPrecificacaoComCliente } from './motor/precificacaoSupabase.ts'
import { carregarDadosDisponibilidadeComCliente } from './motor/supabase.ts'
import type { ResultadoMaterializacaoCiclo } from './materializacao-contrato.ts'

type Linha = Record<string, unknown>
type Ocorrencia = {
  id: string
  ordem: number
  data: string
  horarioApresentado: number
  inicioOperacional: number
  taxidogCicloId: string | null
  estado: string
  atendimentoId: string | null
  servicoIds: string[]
}

export async function materializarCiclo(
  cicloId: string,
  usuarioId: string,
  admin: SupabaseClient,
): Promise<ResultadoMaterializacaoCiclo> {
  const [{ data: ciclo, error: erroCiclo }, { data: ocorrenciasRaw, error: erroOcorrencias }, { data: itensRaw, error: erroItens }] = await Promise.all([
    executarLeituraMaterializacao(
      () => admin.from('contrato_ciclos').select('id,contrato_id,estado,funcionario_responsavel_padrao_id,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido,contratos(pet_id)').eq('id', cicloId).single(),
      { cicloId, etapa: 'carregar_ciclo' },
    ),
    executarLeituraMaterializacao(
      () => admin.from('contrato_ciclo_ocorrencias').select('id,ordem,data_operacional,horario_apresentado,inicio_operacional,taxidog_ciclo_id,plano_operacional,estado,atendimento_id').eq('ciclo_id', cicloId).order('ordem'),
      { cicloId, etapa: 'carregar_ocorrencias' },
    ),
    executarLeituraMaterializacao(
      () => admin.from('contrato_ciclo_ocorrencia_itens').select('ocorrencia_id,contrato_itens(servico_id)').eq('ciclo_id', cicloId),
      { cicloId, etapa: 'carregar_itens_ocorrencias' },
    ),
  ])
  if (erroCiclo) throw new Error('Não foi possível carregar o Ciclo.')
  if (!ciclo) return falha('invalido', 'CICLO_NAO_ENCONTRADO', 'Ciclo não encontrado.', cicloId)
  if (erroOcorrencias || erroItens) throw new Error('Não foi possível carregar as ocorrências do Ciclo.')
  const c = ciclo as unknown as Linha
  if (texto(c.estado) === 'requer_revisao') return falha('invalido', 'CICLO_REQUER_REVISAO', 'Resolva o horário do Ciclo antes de materializar a Agenda.', cicloId)
  if (!['reservado', 'em_andamento'].includes(texto(c.estado))) return falha('invalido', 'CICLO_NAO_MATERIALIZAVEL', 'O estado atual do Ciclo não permite criar a Agenda.', cicloId)
  const contrato = relacao(c.contratos)
  const petId = texto(contrato.pet_id)
  if (!petId) throw new Error('O pet do Contrato não está disponível.')
  const funcionarioResponsavelId = texto(c.funcionario_responsavel_padrao_id)
  if (!funcionarioResponsavelId) return falha('invalido', 'RESPONSAVEL_NAO_DEFINIDO', 'Defina o funcionário responsável do Ciclo antes de materializar a Agenda.', cicloId)
  const idsPorOcorrencia = new Map<string, string[]>()
  for (const item of (itensRaw ?? []) as unknown as Linha[]) {
    const ocorrenciaId = texto(item.ocorrencia_id)
    const servicoId = texto(relacao(item.contrato_itens).servico_id)
    if (ocorrenciaId && servicoId) idsPorOcorrencia.set(ocorrenciaId, [...(idsPorOcorrencia.get(ocorrenciaId) ?? []), servicoId])
  }
  const ocorrencias = ((ocorrenciasRaw ?? []) as unknown as Linha[]).map((item): Ocorrencia => ({
    id: texto(item.id), ordem: numero(item.ordem), data: texto(item.data_operacional),
    horarioApresentado: minutosHora(texto(item.horario_apresentado)),
    inicioOperacional: numero(registro(item.plano_operacional).inicioOperacional),
    taxidogCicloId: textoNulo(item.taxidog_ciclo_id), estado: texto(item.estado),
    atendimentoId: textoNulo(item.atendimento_id), servicoIds: [...new Set(idsPorOcorrencia.get(texto(item.id)) ?? [])].sort(),
  }))
  if (!ocorrencias.length || ocorrencias.some((item) => !item.servicoIds.length)) throw new Error('A composição das ocorrências do Ciclo está incompleta.')
  if (ocorrencias.every((item) => item.atendimentoId)) {
    return { status: 'materializado', cicloId, atendimentos: ocorrencias.map((item) => ({ ocorrenciaId: item.id, atendimentoId: item.atendimentoId! })), reutilizado: true }
  }
  if (ocorrencias.some((item) => item.estado !== 'reservada' || item.atendimentoId)) {
    return falha('conflito', 'CICLO_PARCIALMENTE_MATERIALIZADO', 'O Ciclo possui uma combinação inesperada de ocorrências reservadas e materializadas.', cicloId)
  }

  const { data: versoes, error: erroVersoes } = await admin.from('agenda_versao_configuracao').select('versao').eq('id', true).single()
  const { data: ocupacao, error: erroOcupacao } = await admin.from('agenda_versao_ocupacao').select('versao').eq('id', true).single()
  if (erroVersoes || erroOcupacao || !versoes || !ocupacao) throw new Error('As versões da Agenda não estão disponíveis.')
  const modalidade = texto(c.modalidade_transporte_pretendida) === 'taxidog' ? 'taxidog' as const : 'sem_transporte' as const
  const materializacoes: Record<string, unknown>[] = []
  for (const ocorrencia of ocorrencias) {
    const intencao: ConfirmacaoAgendamentoIntent = {
      chaveIdempotencia: await uuidMaterializacao(ocorrencia.id), petId,
      servicoIds: ocorrencia.servicoIds, data: ocorrencia.data,
      horarioEscolhido: modalidade === 'sem_transporte' ? ocorrencia.horarioApresentado : null,
      modalidade, cicloTaxidogId: modalidade === 'taxidog' ? ocorrencia.taxidogCicloId : null,
      preferenciaFuncionario: 'obrigatorio', funcionarioPreferidoId: funcionarioResponsavelId, funcionarioResponsavelId,
      versaoConfiguracaoConsultada: Number((versoes as Linha).versao),
      versaoOcupacaoConsultada: Number((ocupacao as Linha).versao),
    }
    const entrada = { petId, servicoIds: ocorrencia.servicoIds, data: ocorrencia.data, preferenciaFuncionario: 'obrigatorio' as const, funcionarioPreferidoId: funcionarioResponsavelId, tipoPlanejamento: 'normal' as const, modalidade, cicloTaxidogId: intencao.cicloTaxidogId }
    const [dados, precos] = await Promise.all([
      carregarDadosDisponibilidadeComCliente(entrada, admin, undefined, undefined, ocorrencia.id),
      carregarDadosPrecificacaoComCliente(petId, admin),
    ])
    const resultado = modalidade === 'taxidog'
      ? calcularDisponibilidade(entrada, dados)
      : calcularDisponibilidadeNoHorario(entrada, dados, ocorrencia.horarioApresentado)
    const opcao = resultado.opcoes.find((item) => item.inicioOperacional === ocorrencia.inicioOperacional && (modalidade !== 'taxidog' || item.cicloTaxidog?.id === ocorrencia.taxidogCicloId))
    if (!opcao) return falha('conflito', 'DISPONIBILIDADE_ALTERADA', `A ocorrência ${ocorrencia.ordem} deixou de possuir o plano reservado.`, cicloId)
    const precificacao = calcularPrecificacao(precos.pet, opcao.servicos, precos.dados)
    const plano = montarPlanoConfirmacaoRpc(intencao, dados, opcao, precificacao, await calcularHashIntencao(intencao))
    const invariantes = diagnosticarInvariantesPlanoConfirmacao(plano)
    if (invariantes.length) {
      console.error({
        evento: 'materializacao_plano_invariante', cicloId,
        ocorrenciaId: ocorrencia.id, ocorrenciaOrdem: ocorrencia.ordem,
        invariantes,
      })
      return falha(
        'invalido', 'PLANO_INVALIDO',
        'O plano recalculado não passou pela validação estrutural.', cicloId,
      )
    }
    materializacoes.push({ ocorrenciaId: ocorrencia.id, plano })
  }
  const { data, error } = await admin.rpc('materializar_ciclo_contrato', { p_ciclo_id: cicloId, p_usuario_id: usuarioId, p_materializacoes: materializacoes })
  if (error) throw new Error(`Materialização transacional indisponível: ${texto(error.code) || 'erro'}.`)
  if (!registro(data)) throw new Error('Resposta inválida da materialização do Ciclo.')
  if (data.status === 'materializado' && Array.isArray(data.atendimentos)) {
    return { status: 'materializado', cicloId, atendimentos: data.atendimentos.map((item: unknown) => ({ ocorrenciaId: texto(registro(item).ocorrenciaId), atendimentoId: texto(registro(item).atendimentoId) })), reutilizado: Boolean(data.reutilizado) }
  }
  if (data.codigo === 'PLANO_INVALIDO') {
    console.error({
      evento: 'materializacao_rpc_plano_invalido', cicloId,
      codigoRpc: texto(data.codigo),
      ocorrencias: materializacoes.map((item) => texto(item.ocorrenciaId)),
    })
  }
  return falha(data.status === 'conflito' ? 'conflito' : 'invalido', texto(data.codigo) || 'MATERIALIZACAO_FALHOU', texto(data.mensagem) || 'Não foi possível criar a Agenda do Ciclo.', cicloId)
}

async function uuidMaterializacao(ocorrenciaId: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kaza-pet:materializacao:${ocorrenciaId}`))).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
function falha(status: 'invalido' | 'conflito', codigo: string, mensagem: string, cicloId: string): ResultadoMaterializacaoCiclo { return { status, codigo, mensagem, cicloId } }
function relacao(valor: unknown): Linha { return Array.isArray(valor) ? registro(valor[0]) : registro(valor) }
function registro(valor: unknown): Linha { return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Linha : {} }
function texto(valor: unknown) { return valor === null || valor === undefined ? '' : String(valor) }
function textoNulo(valor: unknown) { const valorTexto = texto(valor); return valorTexto || null }
function numero(valor: unknown) { const convertido = Number(valor); return Number.isFinite(convertido) ? convertido : 0 }
function minutosHora(valor: string) { const [hora, minuto] = valor.slice(0, 5).split(':').map(Number); return hora * 60 + minuto }
