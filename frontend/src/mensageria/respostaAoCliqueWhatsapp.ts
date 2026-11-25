/**
 * Contrato PURO para o retorno automático após escolha do botão no WhatsApp.
 * Não envia mensagens nem altera agenda. O processador real deve:
 *   1. validar webhook, token, destinatário e convite vigente;
 *   2. gravar confirmação/solicitação com idempotência;
 *   3. produzir um único evento de outbox após o COMMIT;
 *   4. enviar o modelo por Cloud API e registrar entrega/falha.
 *
 * Nunca agradecer uma confirmação que não foi persistida.
 */
export type ResultadoProcessamentoWhatsApp =
  | { tipo: 'confirmado'; gravadoNoBanco: boolean; atendimentoId: string; conviteId: string }
  | { tipo: 'remarcacao_solicitada'; gravadoNoBanco: boolean; atendimentoId: string; conviteId: string }
  | { tipo: 'repetido' | 'conflito' | 'convite_expirado' | 'falha' }

export type ConfiguracaoAutoatendimento = {
  // Somente o backend futuro poderá habilitar e gerar a URL assinada por atendimento.
  habilitado: boolean
  urlAssinada?: string | null
  dominiosAutorizados?: readonly string[]
}

export type RespostaPlanejada = {
  eventoCodigo:
    | 'AGENDAMENTO_CONFIRMADO_WHATSAPP'
    | 'REMARCACAO_SOLICITADA_WHATSAPP'
  atendimentoId: string
  conviteId: string
  tipo: 'agradecimento_confirmacao' | 'orientacao_remarcacao'
  urlAutoatendimento: string | null
}

function urlConfiavel(config: ConfiguracaoAutoatendimento | undefined): string | null {
  if (!config?.habilitado || !config.urlAssinada || !config.dominiosAutorizados?.length) return null
  try {
    const url=new URL(config.urlAssinada)
    if (url.protocol !== 'https:' || !config.dominiosAutorizados.includes(url.hostname) ||
        url.username || url.password || url.hash || !url.pathname || url.pathname === '/') return null
    return url.toString()
  } catch {
    return null
  }
}

export function planejarRespostaAoClique(
  resultado: ResultadoProcessamentoWhatsApp,
  autoatendimento?: ConfiguracaoAutoatendimento,
): RespostaPlanejada | null {
  // Esta função somente planeja eventos; não é a autoridade sobre o estado.
  // O banco deve garantir COMMIT e deduplicação durável da outbox.
  // Guard de propriedade: separa os resultados efetivos dos retornos sem
  // gravadoNoBanco/atendimentoId/conviteId. O tipo residual agrupa quatro
  // literais em um único membro da união e não é estreitado por exclusões.
  if (!('gravadoNoBanco' in resultado)) return null
  if (!resultado.gravadoNoBanco || !resultado.atendimentoId || !resultado.conviteId) return null
  if (resultado.tipo === 'confirmado') {
    return {
      eventoCodigo: 'AGENDAMENTO_CONFIRMADO_WHATSAPP',
      atendimentoId:resultado.atendimentoId,
      conviteId:resultado.conviteId,
      tipo:'agradecimento_confirmacao',
      urlAutoatendimento:null,
    }
  }
  return {
    eventoCodigo:'REMARCACAO_SOLICITADA_WHATSAPP',
    atendimentoId:resultado.atendimentoId,
    conviteId:resultado.conviteId,
    tipo:'orientacao_remarcacao',
    // Sem site de autoatendimento pronto, este valor é sempre null.
    urlAutoatendimento:urlConfiavel(autoatendimento),
  }
}
