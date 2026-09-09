import {
  gerarChaveIdempotencia,
  normalizarIntencaoParaHash,
  validarIntencaoConfirmacao,
  type ConfirmacaoAgendamentoIntent,
  type ErroValidacaoIntencao,
  type ModalidadeConfirmacao,
} from './contrato.ts'
import type { PreferenciaFuncionario } from '../motorDisponibilidade/tipos.ts'

export type DadosIntencaoConfirmacaoDev = {
  readonly petId: string
  readonly servicoIds: readonly string[]
  readonly data: string
  readonly horarioEscolhido: number
  readonly modalidade: ModalidadeConfirmacao
  readonly cicloTaxidogId: string | null
  readonly preferenciaFuncionario: PreferenciaFuncionario
  readonly funcionarioPreferidoId: string | null
  readonly funcionarioResponsavelId?: string | null
  readonly versaoConfiguracaoConsultada: number
  readonly versaoOcupacaoConsultada: number
}

export type TentativaConfirmacaoDev = {
  readonly chaveIdempotencia: string
  readonly assinaturaSemantica: string
}

export type IntencaoConfirmacaoDevMontada = {
  readonly intencao: ConfirmacaoAgendamentoIntent
  readonly tentativa: TentativaConfirmacaoDev
  readonly erros: readonly ErroValidacaoIntencao[]
}

export function montarIntencaoConfirmacaoDev(
  dados: DadosIntencaoConfirmacaoDev,
  tentativaAtual: TentativaConfirmacaoDev | null,
  novaChave: () => string = gerarChaveIdempotencia,
): IntencaoConfirmacaoDevMontada {
  const candidata = criarIntencao(dados, tentativaAtual?.chaveIdempotencia ?? novaChave())
  const assinaturaSemantica = JSON.stringify(normalizarIntencaoParaHash(candidata))
  const chaveIdempotencia = tentativaAtual?.assinaturaSemantica === assinaturaSemantica
    ? tentativaAtual.chaveIdempotencia
    : tentativaAtual
      ? novaChave()
      : candidata.chaveIdempotencia
  const intencao = chaveIdempotencia === candidata.chaveIdempotencia
    ? candidata
    : criarIntencao(dados, chaveIdempotencia)

  return {
    intencao,
    tentativa: { chaveIdempotencia, assinaturaSemantica },
    erros: validarIntencaoConfirmacao(intencao),
  }
}

export const montarIntencaoConfirmacao = montarIntencaoConfirmacaoDev
export type TentativaConfirmacao = TentativaConfirmacaoDev

function criarIntencao(
  dados: DadosIntencaoConfirmacaoDev,
  chaveIdempotencia: string,
): ConfirmacaoAgendamentoIntent {
  return {
    chaveIdempotencia,
    petId: dados.petId,
    servicoIds: [...dados.servicoIds],
    data: dados.data,
    horarioEscolhido: dados.modalidade === 'taxidog' ? null : dados.horarioEscolhido,
    modalidade: dados.modalidade,
    cicloTaxidogId: dados.modalidade === 'taxidog' ? dados.cicloTaxidogId : null,
    preferenciaFuncionario: dados.preferenciaFuncionario,
    funcionarioPreferidoId: dados.preferenciaFuncionario === 'automatico'
      ? null
      : dados.funcionarioPreferidoId,
    funcionarioResponsavelId: dados.funcionarioResponsavelId ?? null,
    versaoConfiguracaoConsultada: dados.versaoConfiguracaoConsultada,
    versaoOcupacaoConsultada: dados.versaoOcupacaoConsultada,
  }
}
