/**
 * Liga RPC autoritativa ao gerador de texto; ainda SEM transporte Meta.
 *
 * Somente backend HML deve executar esta função. Os IDs e a allowlist chegam
 * do backend autenticado/secret manager, nunca do navegador.
 * A RPC SQL é restrita a service_role e exige outbox previamente reservada.
 */
import {prepararAgradecimentoHml,type ContextoRespostaHml,
  type PreparacaoRespostaHml} from './respostaOutboxHml.ts'

const REF='jgtctzqieyorhvqxjbpk'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Config={
  projeto:string
  outboxId:string
  chaveTentativa:string
  operadorId:string
  destinatarioPermitidoE164:string
}
type ResultadoContexto = {status:string} & Record<string,unknown>
export type ConsultarContexto =
  (args:{p_outbox:string;p_chave:string;p_operador:string;p_destinatario_permitido:string})=>Promise<unknown>
export type ResultadoPreparado =
  | {status:'pronto'; corpo:Extract<PreparacaoRespostaHml,{status:'pronto'}>['corpo']}
  | {status:'bloqueado';codigo:string}

const CAMPOS=[
  'eventoCodigo','statusAtendimento','statusConvite','textoModelo',
  'destinatarioE164','remetenteClique','mensagemCliqueId',
  'inicioAtualIso','inicioConviteIso','cliqueRecebidoIso','agoraIso',
  'nomeTutor','nomePet','nomeEmpresa'
] as const

export async function montarRespostaDaOutbox(
  config:Config, consultar:ConsultarContexto
):Promise<ResultadoPreparado> {
  if(config.projeto!==REF ||
     !UUID.test(config.outboxId) ||
     !UUID.test(config.chaveTentativa) ||
     !UUID.test(config.operadorId) ||
     !/^\+55[0-9]{10,11}$/.test(config.destinatarioPermitidoE164))
    return {status:'bloqueado',codigo:'CONTEXTO_HML_NAO_AUTORIZADO'}
  let raw:unknown
  try{
    raw=await consultar({
      p_outbox:config.outboxId,
      p_chave:config.chaveTentativa,
      p_operador:config.operadorId,
      p_destinatario_permitido:config.destinatarioPermitidoE164
    })
  }catch{return {status:'bloqueado',codigo:'CONTEXTO_HML_INDISPONIVEL'}}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    return {status:'bloqueado',codigo:'RESPOSTA_RPC_INVALIDA'}
  const r=raw as ResultadoContexto
  if(r.status!=='pronto')return {status:'bloqueado',codigo:'OUTBOX_NAO_ELEGIVEL'}
  if(r.modeloPublicado!==true||CAMPOS.some(k=>typeof r[k]!=='string'))
    return {status:'bloqueado',codigo:'DADOS_RPC_INVALIDOS'}
  if(r.destinatarioE164!==config.destinatarioPermitidoE164)
    return {status:'bloqueado',codigo:'DESTINO_DIVERGENTE'}
  if(r.eventoCodigo!=='AGENDAMENTO_CONFIRMADO_WHATSAPP')
    return {status:'bloqueado',codigo:'EVENTO_NAO_HABILITADO'}
  const result=prepararAgradecimentoHml(r as unknown as ContextoRespostaHml)
  if(result.status!=='pronto')return result
  if(result.corpo.to!==config.destinatarioPermitidoE164.slice(1))
    return {status:'bloqueado',codigo:'DESTINO_DIVERGENTE'}
  return result
}
