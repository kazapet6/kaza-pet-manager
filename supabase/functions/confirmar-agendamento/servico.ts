import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import {
  calcularHashIntencao,
  type ConfirmacaoAgendamentoIntent,
  type ConfirmacaoAgendamentoResposta,
  respostaConfirmacaoValida,
} from '../_shared/confirmacao/contrato.ts'
import { montarPlanoConfirmacaoRpc } from '../_shared/confirmacao/plano.ts'
import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from '../_shared/motor/motor.ts'
import { calcularPrecificacao } from '../_shared/motor/precificacao.ts'
import { carregarDadosPrecificacaoComCliente } from '../_shared/motor/precificacaoSupabase.ts'
import { carregarDadosDisponibilidadeComCliente } from '../_shared/motor/supabase.ts'
import { executarRpcConfirmacao } from '../_shared/confirmacao/observabilidade.ts'

type Versoes = { configuracao: number; ocupacao: number }

export async function confirmarComBackendConfiavel(
  intencao: ConfirmacaoAgendamentoIntent,
  admin: SupabaseClient,
): Promise<ConfirmacaoAgendamentoResposta> {
  const versoes = await carregarVersoes(admin)
  if (intencao.versaoConfiguracaoConsultada !== versoes.configuracao) {
    return {
      status: 'configuracao_alterada', codigo: 'CONFIGURACAO_ALTERADA',
      mensagem: 'A configuracao da agenda mudou. Consulte novamente antes de confirmar.',
      versaoConfiguracaoConsultada: intencao.versaoConfiguracaoConsultada,
      versaoConfiguracaoAtual: versoes.configuracao,
    }
  }

  const entrada = {
    petId: intencao.petId, servicoIds: [...intencao.servicoIds],
    data: intencao.data, preferenciaFuncionario: intencao.preferenciaFuncionario,
    funcionarioPreferidoId: intencao.funcionarioPreferidoId,
    tipoPlanejamento: 'normal' as const, modalidade: intencao.modalidade,
    cicloTaxidogId: intencao.cicloTaxidogId,
  }
  const [dados, precos] = await Promise.all([
    carregarDadosDisponibilidadeComCliente(
      entrada, admin, intencao.chaveIdempotencia,
    ),
    carregarDadosPrecificacaoComCliente(intencao.petId, admin),
  ])
  const resultado = intencao.modalidade === 'taxidog'
    ? calcularDisponibilidade(entrada, dados)
    : calcularDisponibilidadeNoHorario(entrada, dados, intencao.horarioEscolhido!)
  const opcao = resultado.opcoes[0]
  if (!opcao) return indisponivel(intencao, resultado.motivos[0], versoes.ocupacao)

  const precificacao = calcularPrecificacao(precos.pet, opcao.servicos, precos.dados)
  const hash = await calcularHashIntencao(intencao)
  const plano = montarPlanoConfirmacaoRpc(intencao, dados, opcao, precificacao, hash)
  const data = await executarRpcConfirmacao(admin, plano, intencao)
  return traduzirRespostaRpc(data, intencao, opcao, precificacao, versoes)
}

function traduzirRespostaRpc(
  valor: unknown,
  intencao: ConfirmacaoAgendamentoIntent,
  opcao: ReturnType<typeof calcularDisponibilidadeNoHorario>['opcoes'][number],
  precificacao: ReturnType<typeof calcularPrecificacao>,
  versoes: Versoes,
): ConfirmacaoAgendamentoResposta {
  if (!registro(valor)) throw new Error('Resposta invalida da RPC de confirmacao.')
  if (valor.status === 'confirmado') {
    const resposta = {
      status: 'confirmado' as const,
      codigo: 'CONFIRMADO' as const,
      atendimentoId: texto(valor.atendimentoId),
      grupoAgendamentoId: texto(valor.grupoAgendamentoId),
      statusAtendimento: valor.statusAtendimento === 'confirmado' ? 'confirmado' as const : 'agendado' as const,
      horarioConfirmado: opcao.horarioApresentado,
      conclusaoPrevista: opcao.conclusaoPrevista,
      valorFinal: Number(valor.valorFinal ?? precificacao.valorCalculadoAtendimento),
      versaoConfiguracao: Number(valor.versaoConfiguracao ?? versoes.configuracao),
      versaoOcupacao: Number(valor.versaoOcupacao ?? versoes.ocupacao),
      reutilizadoPorIdempotencia: Boolean(valor.reutilizadoPorIdempotencia),
      servicos: opcao.servicos.map(({ id, nome, origem }) => ({ id, nome, origem })),
    }
    if (!respostaConfirmacaoValida(resposta) || !resposta.atendimentoId || !resposta.grupoAgendamentoId) {
      throw new Error('Resposta confirmada incompleta.')
    }
    return resposta
  }
  if (valor.codigo === 'CONFIGURACAO_ALTERADA') {
    return {
      status: 'configuracao_alterada', codigo: 'CONFIGURACAO_ALTERADA',
      mensagem: texto(valor.mensagem) || 'A configuracao mudou durante a confirmacao.',
      versaoConfiguracaoConsultada: intencao.versaoConfiguracaoConsultada,
      versaoConfiguracaoAtual: Number(valor.versaoConfiguracaoAtual ?? versoes.configuracao),
    }
  }
  if (valor.codigo === 'CONFLITO_RECURSO') {
    return indisponivel(intencao, texto(valor.mensagem), versoes.ocupacao)
  }
  return {
    status: 'invalido',
    codigo: valor.codigo === 'IDEMPOTENCIA_CONFLITANTE'
      ? 'IDEMPOTENCIA_CONFLITANTE' : 'INTENCAO_INVALIDA',
    mensagem: valor.codigo === 'IDEMPOTENCIA_CONFLITANTE'
      ? texto(valor.mensagem) : 'O plano recalculado nao passou pela validacao transacional.',
  }
}

async function carregarVersoes(admin: SupabaseClient): Promise<Versoes> {
  const [configuracao, ocupacao] = await Promise.all([
    admin.from('agenda_versao_configuracao').select('versao').eq('id', true).single(),
    admin.from('agenda_versao_ocupacao').select('versao').eq('id', true).single(),
  ])
  if (configuracao.error) throw configuracao.error
  if (ocupacao.error) throw ocupacao.error
  return {
    configuracao: Number(configuracao.data.versao),
    ocupacao: Number(ocupacao.data.versao),
  }
}

function indisponivel(
  intencao: ConfirmacaoAgendamentoIntent,
  motivo: string | undefined,
  versaoOcupacaoAtual: number,
): ConfirmacaoAgendamentoResposta {
  const codigo = intencao.preferenciaFuncionario === 'obrigatorio'
    ? 'FUNCIONARIO_OBRIGATORIO_INDISPONIVEL'
    : intencao.modalidade === 'taxidog'
      ? 'CICLO_TAXIDOG_INVALIDO'
      : 'HORARIO_INDISPONIVEL'
  return {
    status: 'disponibilidade_alterada', codigo,
    mensagem: motivo ?? 'O horario escolhido nao esta mais disponivel.',
    versaoOcupacaoAtual,
  }
}

function registro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor : ''
}
