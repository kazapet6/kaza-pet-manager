/**
 * Consumidor HML — leitura, simulação e auditoria administrativa v2.
 * Nenhuma chamada à Graph API ou scheduler. Única escrita: RPC v2 de auditoria append-only com predecessor.
 * A ação processar_lote está SEMPRE bloqueada nesta versão, inclusive
 * se alguma flag for habilitada acidentalmente.
 */
export const REF='jgtctzqieyorhvqxjbpk'
const BASE='https://'+REF+'.supabase.co'
const ORIGENS=new Set(['http://127.0.0.1:5173','http://localhost:5173'])
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CATEGORIAS_AUDITORIA=new Set([
  'reserva_antiga','resultado_indeterminado','status_contraditorio',
  'status_falhou','aceite_sem_status','entrega_sem_confirmacao'
])
const DECISOES_AUDITORIA=new Set([
  'manter_em_investigacao','solicitar_verificacao_externa','registrar_revisao_sem_reenvio'
])
const MOTIVOS_AUDITORIA=new Set([
  'evidencia_insuficiente','status_inconsistente','identificador_ausente',
  'aguardando_evidencia','revisao_realizada'
])
const objeto=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v)
const igualUuid=(a:unknown,b:unknown)=>a===null&&b===null||uuid(a)&&uuid(b)&&a.toLowerCase()===b.toLowerCase()
const inteiro=(v:unknown,min:number,max=2147483647):v is number=>
  typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max
const permitido=(v:unknown,opcoes:Set<string>):v is string=>typeof v==='string'&&opcoes.has(v)
const dataValida=(v:unknown)=>typeof v==='string'&&v.length<80&&Number.isFinite(Date.parse(v))
const camposExatos=(v:Record<string,unknown>,campos:string[])=>
  Object.keys(v).length===campos.length&&campos.every(k=>Object.hasOwn(v,k))
const eventoValido=(v:unknown,tentativa:unknown):v is Record<string,unknown>=>
  objeto(v)&&uuid(v.evento_id)&&igualUuid(v.tentativa_id,tentativa)&&
  inteiro(v.versao,1)&&(v.versao===1?v.predecessor_id===null:uuid(v.predecessor_id))&&
  !igualUuid(v.evento_id,v.predecessor_id)&&
  permitido(v.categoria,CATEGORIAS_AUDITORIA)&&permitido(v.decisao,DECISOES_AUDITORIA)&&
  permitido(v.motivo,MOTIVOS_AUDITORIA)&&dataValida(v.registrado_em)
const projetarEvento=(v:Record<string,unknown>)=>({
  evento_id:v.evento_id,tentativa_id:v.tentativa_id,predecessor_id:v.predecessor_id,
  versao:v.versao,categoria:v.categoria,decisao:v.decisao,motivo:v.motivo,registrado_em:v.registrado_em
})
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
    // A rota antiga jamais chama a RPC legada ou a v2.
    if(payload.acao==='registrar_decisao_auditoria')
      return responder(503,{codigo:'VERSAO_AUDITORIA_OBSOLETA',reenvio_automatico_autorizado:false},origem)
    if(payload.acao==='registrar_decisao_auditoria_v2'){
      const chaves=['acao','tentativa_id','categoria','decisao','motivo','chave_idempotencia','confirmar_registro','predecessor_id']
      if(!camposExatos(payload,chaves)||payload.confirmar_registro!==true||
        !uuid(payload.tentativa_id)||!uuid(payload.chave_idempotencia)||
        !(payload.predecessor_id===null||uuid(payload.predecessor_id))||
        !permitido(payload.categoria,CATEGORIAS_AUDITORIA)||
        !permitido(payload.decisao,DECISOES_AUDITORIA)||
        !permitido(payload.motivo,MOTIVOS_AUDITORIA))
        return responder(400,{codigo:'DECISAO_INVALIDA'},origem)
      const falha=()=>responder(503,{codigo:'REGISTRO_NAO_VERIFICADO',reenvio_automatico_autorizado:false},origem)
      try{
        const r=await api(c,'/rest/v1/rpc/mensageria_hml_registrar_decisao_auditoria_v2',
          c.key,'POST',fetcher,{
            p_operador:c.adminId,p_tentativa:payload.tentativa_id,
            p_categoria:payload.categoria,p_decisao:payload.decisao,
            p_motivo:payload.motivo,p_chave:payload.chave_idempotencia,p_predecessor:payload.predecessor_id
          })
        const d=r.data
        if(!r.ok||!objeto(d)||d.reenvio_automatico_autorizado!==false)return falha()
        const erros:Record<string,number>={
          nao_autorizado:403,entrada_invalida:400,conflito_idempotencia:409,
          predecessor_desatualizado:409,categoria_desatualizada:409,caso_nao_elegivel:409,
          isolamento_invalido:503
        }
        if(typeof d.status==='string'&&Object.hasOwn(erros,d.status))
          return responder(erros[d.status],{codigo:d.status,reenvio_automatico_autorizado:false},origem)
        if((d.status!=='registrado'&&d.status!=='ja_registrado')||!eventoValido(d,payload.tentativa_id)||
          !igualUuid(d.predecessor_id,payload.predecessor_id)||
          d.categoria!==payload.categoria||d.decisao!==payload.decisao||d.motivo!==payload.motivo)return falha()
        return responder(200,{status:d.status,...projetarEvento(d),reenvio_automatico_autorizado:false},origem)
      }catch{return falha()}
    }
    if(payload.acao==='consultar_historico_auditoria_v2'){
      if(!camposExatos(payload,['acao','tentativa_id','limite','antes_versao'])||
        !uuid(payload.tentativa_id)||!inteiro(payload.limite,1,20)||
        !(payload.antes_versao===null||inteiro(payload.antes_versao,1)))
        return responder(400,{codigo:'CONSULTA_INVALIDA'},origem)
      const falha=()=>responder(503,{codigo:'HISTORICO_NAO_VERIFICADO',reenvio_automatico_autorizado:false},origem)
      try{
        const r=await api(c,'/rest/v1/rpc/mensageria_hml_historico_auditoria_v2',c.key,'POST',fetcher,{
          p_operador:c.adminId,p_tentativa:payload.tentativa_id,p_limite:payload.limite,p_antes_versao:payload.antes_versao
        })
        const d=r.data
        if(!r.ok||!objeto(d)||d.reenvio_automatico_autorizado!==false)return falha()
        if(d.status==='nao_autorizado'||d.status==='entrada_invalida'||d.status==='caso_nao_encontrado')
          return responder(d.status==='nao_autorizado'?403:d.status==='entrada_invalida'?400:404,
            {codigo:d.status,reenvio_automatico_autorizado:false},origem)
        if(d.status!=='ok'||!igualUuid(d.tentativa_id,payload.tentativa_id)||
          !inteiro(d.head_versao,0)||(d.head_versao===0?d.head_evento_id!==null:!uuid(d.head_evento_id))||
          !(d.categoria_atual===null||permitido(d.categoria_atual,CATEGORIAS_AUDITORIA))||
          !Array.isArray(d.eventos)||d.quantidade!==d.eventos.length||d.eventos.length>payload.limite)return falha()
        const inicio=payload.antes_versao===null?d.head_versao:Math.min(d.head_versao,payload.antes_versao-1)
        const quantidade=Math.min(inicio,payload.limite)
        if(d.eventos.length!==quantidade)return falha()
        const eventos:Record<string,unknown>[]=[]
        for(let i=0;i<d.eventos.length;i++){
          const ev:unknown=d.eventos[i]
          if(!eventoValido(ev,payload.tentativa_id)||ev.versao!==inicio-i||
            (ev.versao===d.head_versao&&!igualUuid(ev.evento_id,d.head_evento_id))||
            (i>0&&!igualUuid(eventos[i-1].predecessor_id,ev.evento_id)))return falha()
          eventos.push(ev)
        }
        if(d.proxima_antes_versao!==(inicio>quantidade?inicio-quantidade+1:null))return falha()
        return responder(200,{status:'ok',tentativa_id:d.tentativa_id,head_evento_id:d.head_evento_id,
          head_versao:d.head_versao,categoria_atual:d.categoria_atual,eventos:eventos.map(projetarEvento),
          quantidade:d.quantidade,proxima_antes_versao:d.proxima_antes_versao,reenvio_automatico_autorizado:false},origem)
      }catch{return falha()}
    }
    if(payload.acao==='listar_historico_auditoria_v2'){
      if(!camposExatos(payload,['acao','limite','depois_tentativa'])||!inteiro(payload.limite,1,20)||
        !(payload.depois_tentativa===null||uuid(payload.depois_tentativa)))
        return responder(400,{codigo:'CONSULTA_INVALIDA'},origem)
      const falha=()=>responder(503,{codigo:'HISTORICO_NAO_VERIFICADO',reenvio_automatico_autorizado:false},origem)
      try{
        const r=await api(c,'/rest/v1/rpc/mensageria_hml_listar_historico_auditoria_v2',c.key,'POST',fetcher,{
          p_operador:c.adminId,p_limite:payload.limite,p_depois_tentativa:payload.depois_tentativa
        })
        const d=r.data
        if(!r.ok||!objeto(d)||d.reenvio_automatico_autorizado!==false)return falha()
        if(d.status==='nao_autorizado'||d.status==='entrada_invalida')
          return responder(d.status==='nao_autorizado'?403:400,{codigo:d.status,reenvio_automatico_autorizado:false},origem)
        if(d.status!=='ok'||!Array.isArray(d.itens)||d.quantidade!==d.itens.length||d.itens.length>payload.limite)return falha()
        let anterior=typeof payload.depois_tentativa==='string'?payload.depois_tentativa.toLowerCase():''
        const itens:Record<string,unknown>[]=[]
        for(const item of d.itens){
          if(!objeto(item)||!uuid(item.tentativa_id)||!uuid(item.head_evento_id)||
            !inteiro(item.head_versao,1)||!dataValida(item.registrado_em)||
            item.tentativa_id.toLowerCase()<=anterior)return falha()
          anterior=item.tentativa_id.toLowerCase()
          itens.push({tentativa_id:item.tentativa_id,head_evento_id:item.head_evento_id,
            head_versao:item.head_versao,registrado_em:item.registrado_em})
        }
        if(d.proximo_depois_tentativa!==null&&(!itens.length||itens.length!==payload.limite||
          !igualUuid(d.proximo_depois_tentativa,itens[itens.length-1].tentativa_id)))return falha()
        return responder(200,{status:'ok',itens,quantidade:d.quantidade,
          proximo_depois_tentativa:d.proximo_depois_tentativa,reenvio_automatico_autorizado:false},origem)
      }catch{return falha()}
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
