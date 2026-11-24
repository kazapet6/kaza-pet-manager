/**
 * Consumidor HML — leitura, simulação e auditoria administrativa.
 * Nenhuma chamada à Graph API ou scheduler. Única escrita: RPC de auditoria append-only.
 * A ação processar_lote está SEMPRE bloqueada nesta versão, inclusive
 * se alguma flag for habilitada acidentalmente.
 */
export const REF='jgtctzqieyorhvqxjbpk'
const BASE='https://'+REF+'.supabase.co'
const ORIGENS=new Set(['http://127.0.0.1:5173','http://localhost:5173'])
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type Env={get:(name:string)=>string|undefined}
type Config={key:string;adminId:string}
type Fetch=typeof fetch

function responder(code:number,data:Record<string,unknown>,origin:string|null) {
  return Response.json(data,{status:code,headers:{
    'access-control-allow-origin':origin&&ORIGENS.has(origin)?origin:'null',
    'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
    'access-control-allow-methods':'POST,OPTIONS',
    'cache-control':'no-store','vary':'Origin'
  }})
}
function configurar(env:Env):Config|null{
  if(env.get('SUPABASE_URL')!==BASE||env.get('HML_PROJECT_REF')!==REF)return null
  const key=env.get('SUPABASE_SERVICE_ROLE_KEY')??''
  const adminId=env.get('HML_OPERATOR_UUID')??''
  // O destinatário deve vir de secret privado, nunca de um campo do browser.
  const destinatario=env.get('HML_TEST_RECIPIENT_E164')??''
  if(!key||!UUID.test(adminId)||!/^55[1-9][0-9]{9,10}$/.test(destinatario))
    return null
  return {key,adminId}
}
async function api(
  conf:Config,path:string,credencial:string,method:'GET'|'POST',
  fetcher:Fetch,body?:Record<string,unknown>
) {
  const response=await fetcher(BASE+path,{
    method,redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{
      apikey:conf.key,
      authorization:'Bearer '+credencial,
      'content-type':'application/json'
    },
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
  })
  return {ok:response.ok,status:response.status,data:await response.json().catch(()=>null)}
}
async function adminValido(req:Request,c:Config,fetcher:Fetch) {
  const bearer=req.headers.get('authorization')??''
  if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(bearer))return false
  const jwt=bearer.slice(7)
  const u=await api(c,'/auth/v1/user',jwt,'GET',fetcher)
  if(!u.ok||u.data?.id!==c.adminId||
      u.data?.app_metadata?.role!=='internal'||
      u.data?.app_metadata?.whatsapp_admin!==true)return false
  const ok=await api(c,'/rest/v1/rpc/mensageria_hml_autorizar_operador',
      jwt,'POST',fetcher,{p_expected:c.adminId})
  return ok.ok&&ok.data===true
}
export function criarConsumidorSimulado(env:Env,fetcher:Fetch=fetch) {
  return async (req:Request):Promise<Response>=>{
    const origem=req.headers.get('origin')
    if(origem&&!ORIGENS.has(origem))return responder(403,{codigo:'ORIGEM_NEGADA'},origem)
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
      'access-control-allow-origin':origem&&ORIGENS.has(origem)?origem:'null',
      'access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
      'access-control-allow-methods':'POST,OPTIONS','vary':'Origin'
    }})
    if(req.method!=='POST'||!new URL(req.url).pathname.endsWith('/mensageria-outbox-hml'))
      return responder(405,{codigo:'METODO_NEGADO'},origem)
    if(Number(req.headers.get('content-length')??0)>2048)
      return responder(413,{codigo:'CORPO_GRANDE'},origem)
    const c=configurar(env)
    if(!c)return responder(503,{codigo:'PROJETO_HML_NAO_CONFIGURADO'},origem)
    let autorizado=false
    try{autorizado=await adminValido(req,c,fetcher)}catch{}
    if(!autorizado)return responder(403,{codigo:'OPERADOR_NAO_AUTORIZADO'},origem)
    let payload:Record<string,unknown>
    try{
      const str=await req.text()
      if(str.length>2048)throw Error('limite')
      const v:unknown=JSON.parse(str)
      if(!v||typeof v!=='object'||Array.isArray(v))throw Error('tipo')
      payload=v as Record<string,unknown>
    }catch{return responder(400,{codigo:'CORPO_INVALIDO'},origem)}

    if(payload.acao==='processar_lote'||payload.acao==='enviar') {
      // Não existe transporte Meta nem escrita operacional nesta função.
      // Uma flag true acidental NÃO altera a segurança desta versão.
      return responder(503,{codigo:'ENVIO_INDISPONIVEL_NA_HOMOLOGACAO'},origem)
    }
    if(payload.acao==='registrar_decisao_auditoria'){
      // Escrita administrativa limitada à auditoria append-only. Sem transporte,
      // reserva, alteração de atendimento/outbox ou autorização de reenvio.
      const categorias=new Set([
        'reserva_antiga','resultado_indeterminado','status_contraditorio',
        'status_falhou','aceite_sem_status','entrega_sem_confirmacao'
      ])
      const decisoes=new Set([
        'manter_em_investigacao','solicitar_verificacao_externa','registrar_revisao_sem_reenvio'
      ])
      const motivos=new Set([
        'evidencia_insuficiente','status_inconsistente','identificador_ausente',
        'aguardando_evidencia','revisao_realizada'
      ])
      const chaves=['acao','tentativa_id','categoria','decisao','motivo','chave_idempotencia','confirmar_registro']
      if(Object.keys(payload).length!==chaves.length||
        Object.keys(payload).some(k=>!chaves.includes(k))||
        payload.confirmar_registro!==true||
        typeof payload.tentativa_id!=='string'||!UUID.test(payload.tentativa_id)||
        typeof payload.chave_idempotencia!=='string'||!UUID.test(payload.chave_idempotencia)||
        typeof payload.categoria!=='string'||!categorias.has(payload.categoria)||
        typeof payload.decisao!=='string'||!decisoes.has(payload.decisao)||
        typeof payload.motivo!=='string'||!motivos.has(payload.motivo))
        return responder(400,{codigo:'DECISAO_INVALIDA'},origem)
      try{
        const r=await api(c,'/rest/v1/rpc/mensageria_hml_registrar_decisao_auditoria',
          c.key,'POST',fetcher,{
            p_operador:c.adminId,p_tentativa:payload.tentativa_id,
            p_categoria:payload.categoria,p_decisao:payload.decisao,
            p_motivo:payload.motivo,p_chave:payload.chave_idempotencia
          })
        const d=r.data
        if(!r.ok||!d||typeof d!=='object'||d.reenvio_automatico_autorizado!==false)
          return responder(503,{codigo:'REGISTRO_NAO_VERIFICADO',reenvio_automatico_autorizado:false},origem)
        const erros:Record<string,number>={
          nao_autorizado:403,entrada_invalida:400,conflito_idempotencia:409,
          categoria_desatualizada:409,caso_nao_elegivel:409
        }
        if(typeof d.status==='string'&&Object.hasOwn(erros,d.status))
          return responder(erros[d.status],{codigo:d.status,reenvio_automatico_autorizado:false},origem)
        if((d.status!=='registrado'&&d.status!=='ja_registrado')||
          typeof d.evento_id!=='string'||!UUID.test(d.evento_id)||
          typeof d.tentativa_id!=='string'||d.tentativa_id.toLowerCase()!==payload.tentativa_id.toLowerCase()||
          d.categoria!==payload.categoria||d.decisao!==payload.decisao||d.motivo!==payload.motivo||
          typeof d.registrado_em!=='string'||d.registrado_em.length>=80||!Number.isFinite(Date.parse(d.registrado_em)))
          return responder(503,{codigo:'REGISTRO_NAO_VERIFICADO',reenvio_automatico_autorizado:false},origem)
        return responder(200,{
          status:d.status,evento_id:d.evento_id,tentativa_id:d.tentativa_id,
          categoria:d.categoria,decisao:d.decisao,motivo:d.motivo,registrado_em:d.registrado_em,
          reenvio_automatico_autorizado:false
        },origem)
      }catch{
        // Resultado desconhecido: não repetir automaticamente. A mesma chave
        // permite confirmação manual idempotente sem duplicar o evento.
        return responder(503,{codigo:'REGISTRO_NAO_VERIFICADO',reenvio_automatico_autorizado:false},origem)
      }
    }
    if(payload.acao==='listar_casos_investigacao'){
      // Retorna somente identificador da tentativa, categoria e data.
      // Nunca inclui telefone, corpo, wamid, chaves ou dados do cliente.
      const permitido=new Set([
        'reserva_antiga','resultado_indeterminado','status_contraditorio',
        'status_falhou','aceite_sem_status','entrega_sem_confirmacao'
      ])
      const limite=payload.limite===undefined?10:payload.limite
      if(typeof limite!=='number'||!Number.isInteger(limite)||
          limite<1||limite>20)
        return responder(400,{codigo:'LIMITE_INVALIDO'},origem)
      try {
        const r=await api(c,'/rest/v1/rpc/mensageria_hml_outbox_casos_investigacao',
          c.key,'POST',fetcher,{p_operador:c.adminId,p_limite:limite})
        if(!r.ok||r.data?.status!=='ok'||
          r.data.reenvio_automatico_autorizado!==false||
          !Array.isArray(r.data.casos)||
          r.data.casos.length>limite||
          r.data.quantidade!==r.data.casos.length||
          !r.data.casos.every((item:unknown)=>{
            if(!item||typeof item!=='object'||Array.isArray(item))return false
            const x=item as Record<string,unknown>
            return typeof x.tentativa_id==='string'&&UUID.test(x.tentativa_id)&&
              typeof x.categoria==='string'&&permitido.has(x.categoria)&&
              typeof x.reservado_em==='string'&&
              x.reservado_em.length<80&&Number.isFinite(Date.parse(x.reservado_em))
          }))return responder(503,{codigo:'CASOS_NAO_VERIFICADOS'},origem)
        return responder(200,{
          status:'triagem_somente_leitura',
          casos:r.data.casos.map((item:{tentativa_id:string;categoria:string;reservado_em:string})=>({
            tentativa_id:item.tentativa_id,categoria:item.categoria,
            reservado_em:item.reservado_em
          })),
          quantidade:r.data.quantidade,
          reenvio_automatico_autorizado:false
        },origem)
      }catch{return responder(503,{codigo:'CASOS_NAO_VERIFICADOS'},origem)}
    }
    if(payload.acao==='diagnosticar_reconciliacao') {
      // Agregado de eventos Meta assinados; não altera estados ou reenvia.
      const chaves=[
        'reservas_antigas','indeterminadas','recusadas','aceitas',
        'aceitas_sem_status','status_enviado','status_entregue',
        'status_lido','status_falha','status_contraditorio',
        'webhooks_sem_vinculo_outbox'
      ] as const
      try {
        const r=await api(c,'/rest/v1/rpc/mensageria_hml_outbox_diagnosticar_reconciliacao',
          c.key,'POST',fetcher,{p_operador:c.adminId})
        if(!r.ok||r.data?.status!=='ok'||
           r.data.reenvio_automatico_autorizado!==false||
           chaves.some(k=>typeof r.data[k]!=='number'||
              !Number.isSafeInteger(r.data[k])||r.data[k]<0))
          return responder(503,{codigo:'DIAGNOSTICO_NAO_CONFIRMADO'},origem)
        const resumo:Record<string,unknown>={
          status:'diagnostico_somente_leitura',
          reenvio_automatico_autorizado:false
        }
        for(const k of chaves)resumo[k]=r.data[k]
        return responder(200,resumo,origem)
      }catch{
        return responder(503,{codigo:'DIAGNOSTICO_NAO_CONFIRMADO'},origem)
      }
    }
    if(payload.acao!=='simular_lote')
      return responder(400,{codigo:'ACAO_INVALIDA'},origem)
    const limite=payload.limite===undefined?5:payload.limite
    if(typeof limite!=='number'||!Number.isInteger(limite)||
       limite<1||limite>10)return responder(400,{codigo:'LIMITE_INVALIDO'},origem)

    try {
      const r=await api(c,'/rest/v1/rpc/mensageria_hml_outbox_listar_pendentes',
        c.key,'POST',fetcher,{p_operador:c.adminId,p_limite:limite})
      if(!r.ok||r.data?.status!=='ok'||!Array.isArray(r.data.itens)||
          r.data.itens.length>limite||
          !r.data.itens.every((id:unknown)=>typeof id==='string'&&UUID.test(id))||
          r.data.quantidade!==r.data.itens.length)
        return responder(503,{codigo:'FILA_NAO_VERIFICADA'},origem)
      return responder(200,{
        status:'simulacao_somente_leitura',
        elegiveis:r.data.quantidade,
        limite,
        enviados:0,reservados:0,
        envio_automatico_habilitado:false,
        confirmacao_automatica_habilitada:false
      },origem)
    }catch{
      return responder(503,{codigo:'FILA_NAO_VERIFICADA'},origem)
    }
  }
}
