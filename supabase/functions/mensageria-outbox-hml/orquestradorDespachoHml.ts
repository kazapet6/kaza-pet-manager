/**
 * KAZA PET • Mensageria • HML
 * Plano de despacho da outbox: composição de RPCs autoritativas e transportador injetado.
 *
 * NÃO IMPORTADO pela Edge publicada. NÃO FAZ rede diretamente.
 * Nunca aceitar parâmetros comerciais, telefone ou texto do navegador.
 * Ativar somente após revisão e homologação E2E de um envio Meta real.
 */
import {
  montarRespostaDaOutbox,
  type ConsultarContexto,
} from '../mensageria-confirmacao-hml/contextoOutboxBackendHml.ts'
import type {
  EnvioTextoMeta,
} from '../mensageria-confirmacao-hml/respostaOutboxHml.ts'

const REF='jgtctzqieyorhvqxjbpk'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WAMID=/^wamid\.[a-zA-Z0-9._-]{4,290}$/
const DESTINO=/^55[1-9][0-9]{9,10}$/
type EstadoReserva='reservado'|'ja_reservado'|'nao_pronto'|'agenda_invalida'|'janela_inbound_indisponivel'|'outro'
type Finalizacao='aceito_meta'|'recusado_meta'|'indeterminado'

export type ConfigDespachoHml={
  projeto:string
  operadorId:string
  permitidoE164:string // Secret do servidor, sem '+'
  envioHabilitado:boolean
  autorizacaoExpiraIso:string|null
  agora:()=>Date
  chaveAleatoria:()=>string
}
export type OperacoesDespachoHml={
  listar(limite:number):Promise<{status:string;itens:unknown[];quantidade:number}>
  reservar(input:{outboxId:string;chave:string;operadorId:string}):Promise<{status:EstadoReserva}>
  contexto:ConsultarContexto
  enviar(corpo:EnvioTextoMeta):Promise<{httpStatus:number;wamid?:string|null}>
  finalizar(input:{
    outboxId:string;chave:string;operadorId:string;
    resultado:Finalizacao;wamid:string|null;codigo:string|null
  }):Promise<{status:string}>
}
export type ResultadoDespachoHml={
  estado:'bloqueado'|'fila_vazia'|'concorrencia'|'preparo_bloqueado'|
    'indeterminado'|'recusado'|'aceito'|'aceito_sem_registro'
  codigo:string
  enviados:number
}

function validacao(cfg:ConfigDespachoHml):boolean{
  const t=cfg.agora().getTime()
  const expira=cfg.autorizacaoExpiraIso?Date.parse(cfg.autorizacaoExpiraIso):NaN
  return cfg.projeto===REF&&cfg.envioHabilitado===true&&UUID.test(cfg.operadorId)&&
    DESTINO.test(cfg.permitidoE164)&&Number.isFinite(t)&&Number.isFinite(expira)&&
    expira>t&&expira-t<=180000
}
export async function executarUmAgradecimentoHml(
  cfg:ConfigDespachoHml,ops:OperacoesDespachoHml
):Promise<ResultadoDespachoHml>{
  const resultado=(estado:ResultadoDespachoHml['estado'],codigo:string):ResultadoDespachoHml=>
    ({estado,codigo,enviados:0})
  if(!validacao(cfg))return resultado('bloqueado','AUTORIZACAO_DE_ENVIO_AUSENTE')
  let itens:unknown[]
  try{
    const fila=await ops.listar(1)
    if(fila.status!=='ok'||!Array.isArray(fila.itens)||
       fila.itens.length>1||fila.quantidade!==fila.itens.length||
       !fila.itens.every(x=>typeof x==='string'&&UUID.test(x)))
      return resultado('bloqueado','FILA_INCONSISTENTE')
    itens=fila.itens
  }catch{return resultado('bloqueado','FILA_INDISPONIVEL')}
  if(itens.length===0)return resultado('fila_vazia','NENHUMA_RESPOSTA_ELEGIVEL')
  if(!validacao(cfg))return resultado('bloqueado','AUTORIZACAO_VENCIDA')

  const outboxId=itens[0] as string
  const chave=cfg.chaveAleatoria()
  if(!UUID.test(chave))return resultado('bloqueado','CHAVE_NAO_VALIDA')
  let reservado:{status:EstadoReserva}
  try{
    reservado=await ops.reservar({outboxId,chave,operadorId:cfg.operadorId})
  }catch{return resultado('bloqueado','RESERVA_NAO_CONFIRMADA')}
  if(reservado.status!=='reservado')
    return resultado('concorrencia','NENHUM_REENVIO_AUTORIZADO')

  const finalizar=async(tipo:Finalizacao,codigo:string|null,wamid:string|null)=>{
    try{
      return (await ops.finalizar({
        outboxId,chave,operadorId:cfg.operadorId,
        resultado:tipo,codigo,wamid
      })).status===tipo
    }catch{return false}
  }

  // A consulta RPC autoritativa verifica convite + webhook assinado +
  // banco/agenda + modelo publicado + clique dentro da janela Meta de 24h.
  const montado=await montarRespostaDaOutbox({
    projeto:cfg.projeto,
    outboxId,chaveTentativa:chave,operadorId:cfg.operadorId,
    destinatarioPermitidoE164:'+'+cfg.permitidoE164
  },ops.contexto)
  if(montado.status!=='pronto'){
    // Sem POST Meta. Mantém tentativa única para análise manual; não reabrir fila.
    await finalizar('indeterminado','PREPARO_BLOQUEADO',null)
    return resultado('preparo_bloqueado','CONTEUDO_OU_CONTEXTO_NAO_ELEGIVEL')
  }
  if(montado.corpo.to!==cfg.permitidoE164||!validacao(cfg)){
    await finalizar('indeterminado','PREPARO_BLOQUEADO',null)
    return resultado('preparo_bloqueado','AUTORIZACAO_EXPIRADA_OU_DESTINO_INCORRETO')
  }
  let meta:{httpStatus:number;wamid?:string|null}
  try{
    meta=await ops.enviar(montado.corpo)
  }catch{
    await finalizar('indeterminado','META_TIMEOUT',null)
    return resultado('indeterminado','RESULTADO_META_INCERTO_SEM_REENVIO')
  }
  // HTTP 4xx explícito é recusa. 5xx, 2xx sem wamid e demais são incertos.
  if(Number.isInteger(meta.httpStatus)&&meta.httpStatus>=400&&meta.httpStatus<500){
    await finalizar('recusado_meta','META_HTTP_'+meta.httpStatus,null)
    return resultado('recusado','META_RECUSOU')
  }
  if(meta.httpStatus!==200&&meta.httpStatus!==201||
     !meta.wamid||!WAMID.test(meta.wamid)){
    await finalizar('indeterminado','META_ACEITE_INDETERMINADO',null)
    return resultado('indeterminado','RESULTADO_META_INCERTO_SEM_REENVIO')
  }
  const salvo=await finalizar('aceito_meta',null,meta.wamid)
  if(!salvo)return resultado('aceito_sem_registro','ACEITE_META_RECONCILIACAO_MANUAL')
  return {estado:'aceito',codigo:'META_ACEITOU_NAO_E_ENTREGA',enviados:1}
}
