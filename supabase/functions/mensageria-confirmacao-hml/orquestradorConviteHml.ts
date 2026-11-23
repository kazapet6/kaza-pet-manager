/**
 * Orquestrador backend — convite com dois botões.
 * Dependências são injetadas para permitir testes SEM chamadas à Meta.
 *
 * AVISO: este módulo não está conectado à Edge Function pública.
 * Antes de ligar o transporte, exigir confirmação de template APPROVED
 * na Meta, fonte autoritativa dos dados e autorização de envio de curta duração.
 */
import {prepararTemplateConfirmacaoHml,type CorpoTemplateMeta} from './templateConfirmacao.ts'
import {NOME_TEMPLATE_HML} from './solicitacaoTemplateMeta.ts'
const REF='jgtctzqieyorhvqxjbpk'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WAMID=/^wamid\.[a-z0-9._-]{4,290}$/i
export type RegistroPreparo={
  status:'preparado'|'ja_preparado'|'conflito'|'rejeitado'
  convite_id?:string
}
export type RespostaTransporte={httpStatus:number;messageId?:string|null}
export type OperacoesConvite={
  preparar(input:{
    atendimentoId:string;preparoId:string;hashConfirmar:string;hashRemarcar:string
  }):Promise<RegistroPreparo>
  enviar(corpo:CorpoTemplateMeta):Promise<RespostaTransporte>
  vincular(input:{preparoId:string;messageId:string}):Promise<{status:string}>
  abandonar(input:{preparoId:string}):Promise<{status:string}>
}
export type ContextoConvite={
  // Deverá ser produzido por consulta SQL no backend, nunca enviado pelo browser.
  atendimentoId:string
  destinoE164:string
  parametros:readonly string[]
  templateAprovadoNome:string
}
export type AutorizacaoHml={
  projectRef:string
  envioHabilitado:boolean
  expiraEm:string|null
  destinatarioPermitidoE164:string
  agora:Date
}
export type EstadoEnvioConvite=
 'bloqueado'|'preparo_rejeitado'|'preparo_repetido'|'meta_rejeitada'|
 'resultado_indeterminado'|'aceito_sem_vinculo'|'vinculado'

export async function orquestrarConviteHml(
  auth:AutorizacaoHml,ctx:ContextoConvite,ops:OperacoesConvite,
):Promise<{estado:EstadoEnvioConvite;codigo:string}> {
  const resto=auth.expiraEm?Date.parse(auth.expiraEm)-auth.agora.getTime():NaN
  if(auth.projectRef!==REF || auth.envioHabilitado!==true ||
     !Number.isFinite(resto)||resto<=0||resto>180_000) {
    return {estado:'bloqueado',codigo:'SEM_JANELA_DE_TESTE'}
  }
  if(!UUID.test(ctx.atendimentoId) ||
     ctx.templateAprovadoNome!==NOME_TEMPLATE_HML){
    return {estado:'bloqueado',codigo:'CONTEXTO_OU_TEMPLATE_NAO_APROVADO'}
  }
  // Testa o número exato antes de qualquer transação ou HTTP.
  let template:Awaited<ReturnType<typeof prepararTemplateConfirmacaoHml>>
  try{
    template=await prepararTemplateConfirmacaoHml({
      destinoE164:ctx.destinoE164,
      permitidoE164:auth.destinatarioPermitidoE164,
      templateNome:ctx.templateAprovadoNome,
      idioma:'pt_BR',
      parametros:ctx.parametros
    })
  }catch{
    return {estado:'bloqueado',codigo:'DESTINO_OU_TEMPLATE_INVALIDO'}
  }
  const preparoId=crypto.randomUUID()
  let preparo:RegistroPreparo
  try{
    preparo=await ops.preparar({
      atendimentoId:ctx.atendimentoId,
      preparoId,
      hashConfirmar:template.hashConfirmar,
      hashRemarcar:template.hashRemarcar
    })
  }catch{
    return {estado:'preparo_rejeitado',codigo:'RESERVA_INDISPONIVEL'}
  }
  if(preparo.status==='ja_preparado')
    return {estado:'preparo_repetido',codigo:'NAO_REENVIAR_PREPARO_EXISTENTE'}
  if(preparo.status!=='preparado'||!preparo.convite_id||!UUID.test(preparo.convite_id))
    return {estado:'preparo_rejeitado',codigo:'PREPARO_NAO_CONFIRMADO'}

  // Depois de uma chamada à Meta, resposta perdida significa envio INDETERMINADO.
  // Nunca repetir automaticamente neste cenário — um segundo POST duplicaria
  // o convite e os segredos gerados na chamada anterior seriam perdidos.
  let meta:RespostaTransporte
  try{
    meta=await ops.enviar(template.corpoApi)
  }catch{
    return {estado:'resultado_indeterminado',codigo:'META_RESPOSTA_INCERTA_NAO_REENVIAR'}
  }
  if(meta.httpStatus>=400&&meta.httpStatus<500){
    // Resposta explícita de recusa do servidor: tente encerrar preparo.
    await ops.abandonar({preparoId}).catch(()=>null)
    return {estado:'meta_rejeitada',codigo:'META_REJEITOU_TEMPLATE'}
  }
  if(meta.httpStatus<200||meta.httpStatus>=300||!meta.messageId||
     !WAMID.test(meta.messageId)){
    return {estado:'resultado_indeterminado',codigo:'META_ACEITE_NAO_CONFIRMADO'}
  }
  // Aceite Meta NÃO significa agendamento confirmado. Apenas vincula convite.
  try{
    const vinculo=await ops.vincular({preparoId,messageId:meta.messageId})
    if(vinculo.status==='vinculado'||vinculo.status==='ja_vinculado')
      return {estado:'vinculado',codigo:'CONVITE_PRONTO_PARA_CLIQUE'}
    return {estado:'aceito_sem_vinculo',codigo:'META_ACEITOU_MAS_VINCULO_PENDENTE'}
  }catch{
    return {estado:'aceito_sem_vinculo',codigo:'META_ACEITOU_MAS_BANCO_INDISPONIVEL'}
  }
}
