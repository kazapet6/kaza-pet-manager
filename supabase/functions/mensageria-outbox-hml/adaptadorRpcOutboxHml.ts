/**
 * KAZA PET • adapter RPC da outbox de agradecimentos HML.
 *
 * APENAS para execução injetada/testes. NÃO importado na Edge publicada.
 * Sem chamadas de Graph API, sem agendamento, sem acesso do navegador.
 * Nenhum método acessa a rede quando HML_OUTBOX_RPC_ENABLED !== 'true'.
 */
import type {OperacoesDespachoHml} from './orquestradorDespachoHml.ts'

const REF='jgtctzqieyorhvqxjbpk'
const BASE='https://'+REF+'.supabase.co'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const E164=/^\+55[1-9][0-9]{9,10}$/
const ESTADOS_RESERVA=new Set([
 'reservado','ja_reservado','nao_pronto','agenda_invalida',
 'janela_inbound_indisponivel','outro'
])
const ESTADOS_FINAL=new Set(['aceito_meta','recusado_meta','indeterminado'])
const WAMID=/^wamid\.[A-Za-z0-9._-]{4,290}$/
const CODIGO=/^[A-Z][A-Z0-9_]{1,63}$/
const RPCS={
  listar:'mensageria_hml_outbox_listar_pendentes',
  reservar:'mensageria_hml_outbox_reservar',
  contexto:'mensageria_hml_outbox_contexto',
  finalizar:'mensageria_hml_outbox_finalizar'
} as const
type Env={get:(nome:string)=>string|undefined}
type Fetch=(url:string,init:RequestInit)=>Promise<Response>
type Envio=OperacoesDespachoHml['enviar']

export type ConfigAdaptadorRpcHml={
  ambiente:Env
  requisitar:Fetch // obrigatório: teste sempre injetado, sem fallback implícito
  enviar:Envio // transporte injetado; não importamos Meta aqui
}
export type RpcOutboxHml=OperacoesDespachoHml & {
  /** Retorna apenas se o ambiente indica HML e a flag de RPC está ligada */
  configurado:()=>boolean
}
export function criarAdaptadorRpcOutboxHml({
  ambiente,requisitar,enviar
}:ConfigAdaptadorRpcHml):RpcOutboxHml{
  const permitido=()=>{
    const secret=ambiente.get('SUPABASE_SERVICE_ROLE_KEY')??''
    const operator=ambiente.get('HML_OPERATOR_UUID')??''
    return ambiente.get('SUPABASE_URL')===BASE&&
      ambiente.get('HML_PROJECT_REF')===REF&&
      ambiente.get('HML_OUTBOX_RPC_ENABLED')==='true'&&
      secret.length>=32&&secret.length<=8192&&!/[\r\n]/.test(secret)&&
      UUID.test(operator)&&typeof requisitar==='function'&&
      typeof enviar==='function'
  }
  const rpc=async (
    acao:keyof typeof RPCS, corpo:Record<string,unknown>
  ):Promise<Record<string,unknown>>=>{
    if(!permitido())throw Error('RPC_HML_DESATIVADA')
    const secret=ambiente.get('SUPABASE_SERVICE_ROLE_KEY')!
    let resposta:Response
    try {
      resposta=await requisitar(BASE+'/rest/v1/rpc/'+RPCS[acao],{
        method:'POST',redirect:'error',
        headers:{
          apikey:secret,authorization:'Bearer '+secret,
          'content-type':'application/json'
        },
        body:JSON.stringify(corpo),
        signal:AbortSignal.timeout(12000)
      })
    }catch{throw Error('RPC_HML_RESPOSTA_INDISPONIVEL')}
    if(!resposta.ok)throw Error('RPC_HML_REJEITADA')
    let data:unknown
    try{data=await resposta.json()}catch{
      throw Error('RPC_HML_RESPOSTA_INVALIDA')
    }
    if(!data||typeof data!=='object'||Array.isArray(data))
      throw Error('RPC_HML_RESPOSTA_INVALIDA')
    return data as Record<string,unknown>
  }
  const autorizado=(id:string)=>UUID.test(id)&&
    id===ambiente.get('HML_OPERATOR_UUID')
  return {
    configurado:permitido,
    async listar(limite){
      if(!Number.isInteger(limite)||limite<1||limite>10)
        throw Error('LIMITE_RPC_INVALIDO')
      const op=ambiente.get('HML_OPERATOR_UUID')??''
      if(!autorizado(op))throw Error('OPERADOR_RPC_INVALIDO')
      const r=await rpc('listar',{p_operador:op,p_limite:limite})
      if(r.status!=='ok'||!Array.isArray(r.itens)||
         !Number.isInteger(r.quantidade)||r.quantidade!==r.itens.length||
         r.itens.length>limite||
         !r.itens.every(id=>typeof id==='string'&&UUID.test(id)))
        throw Error('FILA_RPC_INCONSISTENTE')
      return {status:'ok',itens:r.itens,quantidade:r.quantidade as number}
    },
    async reservar({outboxId,chave,operadorId}){
      if(!UUID.test(outboxId)||!UUID.test(chave)||!autorizado(operadorId))
        throw Error('RESERVA_RPC_INVALIDA')
      const r=await rpc('reservar',{
        p_outbox:outboxId,p_chave:chave,p_operador:operadorId
      })
      if(typeof r.status!=='string'||!ESTADOS_RESERVA.has(r.status))
        throw Error('RESERVA_RPC_INDETERMINADA')
      return {status:r.status as Awaited<ReturnType<OperacoesDespachoHml['reservar']>>['status']}
    },
    async contexto({p_outbox,p_chave,p_operador,p_destinatario_permitido}){
      if(!UUID.test(p_outbox)||!UUID.test(p_chave)||
        !autorizado(p_operador)||!E164.test(p_destinatario_permitido)||
        p_destinatario_permitido!=='+'
          +(ambiente.get('HML_TEST_RECIPIENT_E164')??''))
        throw Error('CONTEXTO_RPC_NAO_AUTORIZADO')
      const resposta=await rpc('contexto',{
        p_outbox,p_chave,p_operador,p_destinatario_permitido
      })
      if(typeof resposta.status!=='string')
        throw Error('CONTEXTO_RPC_INVALIDO')
      return resposta
    },
    async finalizar({outboxId,chave,operadorId,resultado,wamid,codigo}){
      if(!UUID.test(outboxId)||!UUID.test(chave)||!autorizado(operadorId)||
        !ESTADOS_FINAL.has(resultado))
        throw Error('FINALIZACAO_RPC_INVALIDA')
      if(resultado==='aceito_meta'){
        if(typeof wamid!=='string'||!WAMID.test(wamid)||codigo!==null)
          throw Error('ACEITE_RPC_INVALIDO')
      }else{
        if(wamid!==null||typeof codigo!=='string'||!CODIGO.test(codigo))
          throw Error('MOTIVO_RPC_INVALIDO')
      }
      const r=await rpc('finalizar',{
        p_outbox:outboxId,p_chave:chave,p_operador:operadorId,
        p_resultado:resultado,p_wamid:wamid,p_codigo:codigo
      })
      if(typeof r.status!=='string'||r.status.length>80)
        throw Error('FINALIZACAO_RPC_RESPOSTA_INVALIDA')
      return {status:r.status}
    },
    async enviar(corpo){
      if(!permitido())throw Error('RPC_HML_DESATIVADA')
      return enviar(corpo)
    }
  }
}
