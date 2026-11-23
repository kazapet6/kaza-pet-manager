/**
 * Guard administrativo — publicação do rascunho somente na homologação.
 * Não cria, publica ou envia nada: valida um pedido que depois é autorizado
 * pela Edge e pela RPC de versão no banco.
 */
export type PedidoPublicacao={
  id:string
  versaoEsperada:number
  chaveIdempotencia:string
}
export type ResultadoGuard={
  ok:true
  pedido:PedidoPublicacao
}|{
  ok:false
  status:number
  codigo:string
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validarPublicacaoModeloHml(
  body:Record<string,unknown>,habilitada:boolean
):ResultadoGuard {
  if(!habilitada)return {ok:false,status:503,codigo:'PUBLICACAO_DESATIVADA'}
  if(typeof body.id!=='string'||!UUID.test(body.id)||
     typeof body.chaveIdempotencia!=='string'||!UUID.test(body.chaveIdempotencia)||
     typeof body.versaoEsperada!=='number'||!Number.isInteger(body.versaoEsperada)||
     body.versaoEsperada<1||body.versaoEsperada>1000000)
    return {ok:false,status:400,codigo:'PEDIDO_PUBLICACAO_INVALIDO'}
  return {ok:true,pedido:{
    id:body.id,versaoEsperada:body.versaoEsperada,
    chaveIdempotencia:body.chaveIdempotencia
  }}
}
