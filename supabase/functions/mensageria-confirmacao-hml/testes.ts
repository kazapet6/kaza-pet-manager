import assert from 'node:assert/strict'
import {criarHandler,REF} from './handler.ts'
type Env={get(name:string):string|undefined}
const admin='11111111-1111-4111-8111-111111111111'
const base='https://'+REF+'.supabase.co'
const jwt='x'.repeat(40)
const secret='secret_do_servidor_ficticio'
const env:Env={get(name){
  const flags:Record<string,string>={
    HML_PROJECT_REF:REF,SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:secret,
    HML_OPERATOR_UUID:admin,HML_CONFIRMATION_PROCESSOR_ENABLED:'false',
  }
  return flags[name]
}}
const rotas:string[]=[]
const fakeFetch=async (url:string|URL|Request,options?:RequestInit):Promise<Response>=>{
  const uri=String(url)
  rotas.push(uri)
  if(uri.endsWith('/auth/v1/user'))return Response.json({
    id:admin,app_metadata:{role:'internal',whatsapp_admin:true}
  })
  if(uri.endsWith('/rest/v1/rpc/mensageria_hml_autorizar_operador'))return Response.json(true)
  if(uri.endsWith('/rest/v1/rpc/mensageria_hml_diagnostico_confirmacoes'))
    return Response.json({status:'ok',convites_ativos:0,convites_confirmados:0,
      convites_expirados:0,cliques_processados:0,remarcacoes_pendentes:0,
      respostas_aguardando:0,respostas_prontas:0,respostas_reservadas:0,
      respostas_aceitas_meta:0,respostas_recusadas_meta:0,respostas_indeterminadas:0,
      templates_meta_cadastrados:0,agendamentos_hml:0})
  if(uri.endsWith('/rest/v1/rpc/mensageria_hml_listar_cliques_pendentes'))
    return Response.json({status:'ok',itens:['22222222-2222-4222-8222-222222222222']})
  if(uri.endsWith('/rest/v1/rpc/mensageria_hml_processar_confirmacao'))
    return Response.json({status:'confirmado'})
  assert.fail('Endpoint inesperado: '+uri)
}
const handler=criarHandler(env,fakeFetch as typeof fetch)
function req(body:unknown,token=jwt,origin='http://127.0.0.1:5173') {
  return new Request(base+'/functions/v1/mensageria-confirmacao-hml',{
    method:'POST',headers:{origin,authorization:'Bearer '+token},
    body:JSON.stringify(body)
  })
}
let r=await handler(req({acao:'diagnostico'}))
assert.equal(r.status,200)
let data=await r.json()
assert.equal(data.convites_ativos,0)
assert.equal(data.respostas_prontas,0)
assert.equal(data.respostas_reservadas,0)
assert.equal(data.respostas_aceitas_meta,0)
assert.equal(data.respostas_recusadas_meta,0)
assert.equal(data.respostas_indeterminadas,0)
assert.equal(data.envio_automatico_habilitado,false)
assert.equal(data.processamento_habilitado,false)
r=await handler(req({acao:'processar_item',itemId:'22222222-2222-4222-8222-222222222222'}))
assert.equal(r.status,503)
assert.equal((await r.json()).codigo,'PROCESSAMENTO_DESATIVADO')
assert.ok(!rotas.some(v=>v.includes('/rpc/mensageria_hml_processar_confirmacao')),
  'A flag bloqueada não pode chamar RPC de atualização')
r=await handler(req({acao:'diagnostico'},''))
assert.equal(r.status,403)
r=await handler(req({acao:'diagnostico'},jwt,'https://origem-nao-autorizada.example'))
assert.equal(r.status,403)
r=await handler(req({acao:'desconhecida'}))
assert.equal(r.status,400)
const envErrado:Env={get(name){return name==='HML_PROJECT_REF'?'producao':env.get(name)}}
r=await criarHandler(envErrado,fakeFetch as typeof fetch)(req({acao:'diagnostico'}))
assert.equal(r.status,503)
assert.ok(rotas.every(x=>x.startsWith(base)),
  'Nenhuma chamada para produção, Meta ou domínio externo')
const opts=await handler(new Request(base+'/functions/v1/mensageria-confirmacao-hml',{
  method:'OPTIONS',headers:{origin:'http://127.0.0.1:5173'}
}))
assert.equal(opts.status,204)
assert.equal(await opts.text(),'')
assert.equal(opts.headers.get('access-control-allow-origin'),'http://127.0.0.1:5173')
const envAberto:Env={get(name){
  return name==='HML_CONFIRMATION_PROCESSOR_ENABLED'?'true':env.get(name)
}}
const handlerAberto=criarHandler(envAberto,fakeFetch as typeof fetch)
r=await handlerAberto(req({acao:'processar_item',itemId:'invalido'}))
assert.equal(r.status,400)
const processadosAntes=rotas.filter(x=>x.includes('/rpc/mensageria_hml_processar_confirmacao')).length
r=await handlerAberto(req({acao:'processar_item',itemId:'22222222-2222-4222-8222-222222222222'}))
assert.equal(r.status,200)
assert.equal((await r.json()).status,'confirmado')
assert.equal(rotas.filter(x=>x.includes('/rpc/mensageria_hml_processar_confirmacao')).length,processadosAntes+1,
 'Processar somente quando a flag explícita estiver habilitada')
assert.ok(rotas.every(x=>x.startsWith(base)), 'Todas as chamadas devem ficar na HML')
r=await handler(req({acao:'processar_lote',limite:1}))
assert.equal(r.status,503)
assert.equal((await r.json()).codigo,'PROCESSAMENTO_DESATIVADO')
assert.equal(rotas.filter(x=>x.includes('/rpc/mensageria_hml_listar_cliques_pendentes')).length,0,
  'Flag desligada nunca pode consultar fila')
r=await handlerAberto(req({acao:'processar_lote',limite:20}))
assert.equal(r.status,400)
r=await handlerAberto(req({acao:'processar_lote',limite:1}))
assert.equal(r.status,200)
const lote=await r.json()
assert.equal(lote.codigo,'LOTE_CONCLUIDO')
assert.equal(lote.encontrados,1)
assert.equal(lote.contagem.confirmado,1)
assert.equal(lote.envio_automatico_habilitado,false)
assert.equal(rotas.filter(x=>x.includes('/rpc/mensageria_hml_listar_cliques_pendentes')).length,1)
assert.ok(rotas.every(x=>x.startsWith(base)),
  'Nem Meta nem produção podem ser chamados por este módulo')
console.log('MENSAGERIA CONFIRMACAO HML - API DIAGNOSTICO E FLAG OFF - PASS')
