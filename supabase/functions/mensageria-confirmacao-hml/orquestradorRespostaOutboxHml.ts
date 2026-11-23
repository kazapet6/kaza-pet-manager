/**
 * Despacho de respostas de confirmação no WhatsApp — apenas orquestração
 * TESTÁVEL COM MOCKS. NÃO conectado a nenhuma Edge Function publicada.
 *
 * Depende de reserva transacional e reconciliação durável no banco, ainda
 * pendentes. Nunca reenviar automaticamente em timeout ou estado incerto.
 */
import {
  prepararAgradecimentoHml,
  type ContextoRespostaHml,
  type EnvioTextoMeta,
} from './respostaOutboxHml.ts'

const HML_REF='jgtctzqieyorhvqxjbpk'
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const WAMID=/^wamid\.[A-Za-z0-9._-]{4,290}$/

export type AutorizacaoRespostaHml={
  projeto:string
  envioHabilitado:boolean
  expiraEm:string|null
  agora:()=>Date
}
export type OperacoesOutboxHml={
  // Implementar depois em RPC restrita e ACID (chave única por outbox).
  reservar(id:string):Promise<'reservado'|'ja_reservado'|'bloqueado'>
  enviar(corpo:EnvioTextoMeta):Promise<{status:number;messageId?:string|null}>
  registrarAceite(id:string,messageId:string):Promise<boolean>
  registrarRecusa(id:string,codigo:string):Promise<void>
  registrarIndeterminado(id:string):Promise<void>
}
export type ResultadoOutboxHml={
  estado:'bloqueado'|'reservado_em_outro_processamento'|'recusado'|
    'indeterminado'|'aceito_sem_registro'|'aceito'
  codigo:string
}

function janelaValida(auth:AutorizacaoRespostaHml):boolean {
  const restante=auth.expiraEm?Date.parse(auth.expiraEm)-auth.agora().getTime():NaN
  return auth.projeto===HML_REF&&auth.envioHabilitado===true&&
    Number.isFinite(restante)&&restante>0&&restante<=180_000
}
export async function orquestrarRespostaHml(
  idOutbox:string,autorizacao:AutorizacaoRespostaHml,
  contexto:ContextoRespostaHml,operacoes:OperacoesOutboxHml,
):Promise<ResultadoOutboxHml>{
  if(!UUID.test(idOutbox)||!janelaValida(autorizacao))
    return {estado:'bloqueado',codigo:'ENVIO_SEM_AUTORIZACAO'}
  const resposta=prepararAgradecimentoHml(contexto)
  if(resposta.status!=='pronto')
    return {estado:'bloqueado',codigo:resposta.codigo}
  let reserva:'reservado'|'ja_reservado'|'bloqueado'
  try{reserva=await operacoes.reservar(idOutbox)}
  catch{return {estado:'bloqueado',codigo:'BANCO_NAO_CONFIRMOU_RESERVA'}}
  if(reserva!=='reservado')
    return {estado:'reservado_em_outro_processamento',codigo:'NAO_REENVIAR'}
  if(!janelaValida(autorizacao)){
    // Reserva já existe; não mandar e exigir reconciliação.
    await operacoes.registrarIndeterminado(idOutbox).catch(()=>null)
    return {estado:'indeterminado',codigo:'AUTORIZACAO_EXPIRADA_ANTES_POST'}
  }
  let http:{status:number;messageId?:string|null}
  try{http=await operacoes.enviar(resposta.corpo)}
  catch{
    await operacoes.registrarIndeterminado(idOutbox).catch(()=>null)
    return {estado:'indeterminado',codigo:'META_RESPOSTA_INCERTA_NAO_REENVIAR'}
  }
  // Só classificar recusa após uma resposta explícita do servidor.
  if(http.status>=400&&http.status<500){
    await operacoes.registrarRecusa(idOutbox,'META_HTTP_'+http.status).catch(()=>null)
    return {estado:'recusado',codigo:'META_REJEITOU'}
  }
  if(http.status<200||http.status>=300||!http.messageId||!WAMID.test(http.messageId)){
    await operacoes.registrarIndeterminado(idOutbox).catch(()=>null)
    return {estado:'indeterminado',codigo:'META_SEM_ACEITE_INEQUIVOCO'}
  }
  try{
    if(await operacoes.registrarAceite(idOutbox,http.messageId))
      return {estado:'aceito',codigo:'RESPOSTA_ACEITA_META'}
  }catch{/* Aceite Meta sem registro = caso de reconciliação, não reenvio. */}
  return {estado:'aceito_sem_registro',codigo:'RECONCILIACAO_NECESSARIA'}
}
