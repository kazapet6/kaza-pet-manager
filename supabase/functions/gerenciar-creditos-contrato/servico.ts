import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { agregarCreditos, estadoCredito, type DetalheCicloCreditos, type DetalheUnidadeCredito, type EstadoCreditoContrato, type ResumoContratoCreditos, type ResumoServicoCredito, type UnidadeCredito } from '../_shared/credito-contrato.ts'
import type { IntencaoCreditos } from './handler.ts'
type L=Record<string,unknown>

export async function executarCreditosContrato(i:IntencaoCreditos,usuarioId:string,admin:SupabaseClient,renovar:(cicloId:string)=>Promise<void>):Promise<unknown>{
  if(i.operacao==='resumo_contrato'&&texto(i.contratoId))return resumoContrato(texto(i.contratoId),admin)
  if(i.operacao==='detalhe_ciclo'&&texto(i.cicloId))return detalheCiclo(texto(i.cicloId),admin)
  if(i.operacao==='detalhe_credito'&&texto(i.ocorrenciaId)&&texto(i.contratoItemId))return detalheCredito(texto(i.ocorrenciaId),texto(i.contratoItemId),admin)
  if(i.operacao==='reverter_conclusao')return rpc('reverter_conclusao_atendimento',{...i,usuarioId},admin)
  if(['decidir_falta','corrigir_decisao','decidir_encerramento'].includes(i.operacao)){
    const resultado=await rpc('decidir_credito_contrato',{...i,usuarioId},admin)
    if(resultado?.status==='atualizado'){
      try {
        const {data,error}=await admin.from('contrato_ciclo_ocorrencias').select('ciclo_id').eq('id',resultado.ocorrenciaId).single()
        if(error)throw error
        await renovar(String(data.ciclo_id))
      } catch {
        console.error({evento:'renovacao_automatica_pendente',ocorrenciaId:resultado.ocorrenciaId})
      }
    }
    return resultado
  }
  return{status:'invalido',codigo:'INTENCAO_INVALIDA',mensagem:'Operação de crédito inválida.'}
}

async function resumoContrato(contratoId:string,admin:SupabaseClient):Promise<ResumoContratoCreditos>{
  const{data:ciclos,error}=await admin.from('contrato_ciclos').select('id,numero,estado,encerramento_pendente,data_ancora_pretendida,concluido_em,materializacao_estado,materializacao_tentativas,materializacao_ultimo_codigo_erro,materializacao_ultimo_erro,materializacao_ultima_tentativa_em,materializacao_concluida_em').eq('contrato_id',contratoId).order('numero',{ascending:false})
  if(error)throw error
  const ids=(ciclos??[]).map(c=>String(c.id));if(!ids.length)return{status:'carregado',contratoId,ciclos:[]}
  const[{data:creditos,error:ec},{data:ocorrencias,error:eo},{data:contrato,error:ect}]=await Promise.all([
    admin.from('contrato_ciclo_ocorrencia_itens').select('ciclo_id,estado_comercial').in('ciclo_id',ids),
    admin.from('contrato_ciclo_ocorrencias').select('ciclo_id,data_operacional').in('ciclo_id',ids),
    admin.from('contratos').select('valor_contratado').eq('id',contratoId).single(),
  ]);if(ec||eo||ect)throw ec||eo||ect
  const comercial=await carregarComercial(contratoId,admin)
  const resumos=(ciclos??[]).map(c=>{
    const itens=(creditos??[]).filter(x=>String(x.ciclo_id)===String(c.id)).map(x=>({estadoComercial:estado(x.estado_comercial)})),datas=(ocorrencias??[]).filter(x=>String(x.ciclo_id)===String(c.id)).map(x=>String(x.data_operacional)).sort()
    return{...comercial(String(c.id)),id:String(c.id),numero:Number(c.numero),estado:String(c.estado),atual:String(c.estado)!=='cancelado'&&!comercial(String(c.id)).comercialmenteConcluido,inicio:datas[0]??String(c.data_ancora_pretendida),fim:datas.at(-1)??String(c.data_ancora_pretendida),encerramentoPendente:Boolean(c.encerramento_pendente),valor:Number(contrato?.valor_contratado??0),...materializacao(c as L),...agregarCreditos(itens)}
  }).sort((a,b)=>Number(b.atual)-Number(a.atual)||b.numero-a.numero)
  const atuais=await Promise.all(resumos.map(async c=>{const ctx=await contexto044(c.id,admin),datas=[...ctx.values()].map(x=>String(x.data??'')).filter(Boolean).sort();return{...c,inicio:datas[0]??c.inicio,fim:datas.at(-1)??c.fim}}))
  return{status:'carregado',contratoId,ciclos:atuais}
}

async function detalheCiclo(cicloId:string,admin:SupabaseClient):Promise<DetalheCicloCreditos>{
  const{data:ciclo,error:erroCiclo}=await admin.from('contrato_ciclos').select('id,contrato_id,numero,estado,encerramento_pendente,data_ancora_pretendida,materializacao_estado,materializacao_tentativas,materializacao_ultimo_codigo_erro,materializacao_ultimo_erro,materializacao_ultima_tentativa_em,materializacao_concluida_em').eq('id',cicloId).single();if(erroCiclo)throw erroCiclo
  const{data:itens,error:erroItens}=await admin.from('contrato_ciclo_ocorrencia_itens').select('ocorrencia_id,contrato_item_id,ciclo_id,ordinal_no_item,estado_comercial,estado_comercial_versao,estado_comercial_atualizado_em').eq('ciclo_id',cicloId);if(erroItens)throw erroItens
  const ocorrenciaIds=[...new Set((itens??[]).map(x=>String(x.ocorrencia_id)))],itemIds=[...new Set((itens??[]).map(x=>String(x.contrato_item_id)))]
  const[{data:ocorrencias,error:eo},{data:contratoItens,error:ei},{data:contrato,error:ect}]=await Promise.all([
    ocorrenciaIds.length?admin.from('contrato_ciclo_ocorrencias').select('id,ordem,data_operacional,horario_apresentado,inicio_operacional,conclusao_prevista,atendimento_id').in('id',ocorrenciaIds):Promise.resolve({data:[],error:null}),
    itemIds.length?admin.from('contrato_itens').select('id,servico_id,servico_nome_snapshot,ordem_snapshot,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade').in('id',itemIds):Promise.resolve({data:[],error:null}),
    admin.from('contratos').select('valor_contratado').eq('id',String(ciclo.contrato_id)).single(),
  ]);if(eo||ei||ect)throw eo||ei||ect
  const atendimentoIds=(ocorrencias??[]).map(x=>x.atendimento_id).filter(Boolean).map(String)
  const{data:atendimentos,error:ea}=atendimentoIds.length?await admin.from('atendimentos').select('id,status').in('id',atendimentoIds):{data:[],error:null};if(ea)throw ea
  const ctx044=await contexto044(cicloId,admin)
  const unidades=(itens??[]).map(x=>({...unidade(x as L,ocorrencias??[],atendimentos??[]),...exigirContexto044(ctx044,String(x.ocorrencia_id),String(x.contrato_item_id))})),datas=unidades.map(x=>String(x.data??'')).filter(Boolean).sort()
  const servicos:ResumoServicoCredito[]=(contratoItens??[]).map(ci=>{const us=unidades.filter(u=>u.contratoItemId===String(ci.id)).sort((a,b)=>a.ordinal-b.ordinal);return{contratoItemId:String(ci.id),servicoId:String(ci.servico_id),nome:String(ci.servico_nome_snapshot),ordem:Number(ci.ordem_snapshot),intervaloQuantidade:Number(ci.intervalo_quantidade),intervaloUnidade:String(ci.intervalo_unidade),unidades:us,...agregarCreditos(us)}}).sort((a,b)=>a.ordem-b.ordem)
  const comercial=await carregarComercial(String(ciclo.contrato_id),admin)
  const todos=servicos.flatMap(s=>s.unidades)
  const { data: eventosPulo, error: erroPulos } = await admin.from('contrato_eventos').select('id,detalhes,ocorrido_em')
    .eq('contrato_id', ciclo.contrato_id).eq('tipo', 'banho_pulado').eq('detalhes->>cicloId', cicloId).order('ocorrido_em')
  if (erroPulos) throw erroPulos
  const pulos = (eventosPulo ?? []).map(evento => ({
    id: evento.id, ocorridoEm: evento.ocorrido_em, numero: Number(evento.detalhes.numeroPulo),
    motivo: texto(evento.detalhes.motivo), autorizado: Boolean(evento.detalhes.autorizadoPor),
  }))
  return{status:'carregado',...comercial(String(ciclo.id)),id:String(ciclo.id),numero:Number(ciclo.numero),estado:String(ciclo.estado),atual:String(ciclo.estado)!=='cancelado'&&!comercial(String(ciclo.id)).comercialmenteConcluido,inicio:datas[0]??String(ciclo.data_ancora_pretendida),fim:datas.at(-1)??String(ciclo.data_ancora_pretendida),encerramentoPendente:Boolean(ciclo.encerramento_pendente),valor:Number(contrato?.valor_contratado??0),...materializacao(ciclo as L),servicos,pulos,...agregarCreditos(todos)}
}

async function detalheCredito(ocorrenciaId:string,contratoItemId:string,admin:SupabaseClient):Promise<DetalheUnidadeCredito>{
  const{data:item,error:eItem}=await admin.from('contrato_ciclo_ocorrencia_itens').select('ocorrencia_id,contrato_item_id,ciclo_id,ordinal_no_item,estado_comercial,estado_comercial_versao,estado_comercial_atualizado_em').eq('ocorrencia_id',ocorrenciaId).eq('contrato_item_id',contratoItemId).single();if(eItem)throw eItem
  const[{data:ocorrencia,error:eo},{data:contratoItem,error:ei},{data:ciclo,error:ec},{data:eventos,error:ee}]=await Promise.all([
    admin.from('contrato_ciclo_ocorrencias').select('id,ordem,data_operacional,horario_apresentado,inicio_operacional,conclusao_prevista,atendimento_id').eq('id',ocorrenciaId).single(),
    admin.from('contrato_itens').select('id,servico_nome_snapshot').eq('id',contratoItemId).single(),
    admin.from('contrato_ciclos').select('id,numero,encerramento_pendente,modalidade_transporte_pretendida').eq('id',String(item.ciclo_id)).single(),
    admin.from('contrato_credito_eventos').select('id,tipo,estado_anterior,estado_novo,responsavel_id,motivo,ocorrido_em').eq('ocorrencia_id',ocorrenciaId).eq('contrato_item_id',contratoItemId).order('ocorrido_em',{ascending:true}),
  ]);if(eo||ei||ec||ee)throw eo||ei||ec||ee
  const atual044=exigirContexto044(await contexto044(String(item.ciclo_id),admin),ocorrenciaId,contratoItemId)
  const atendimentoId=atual044.atendimentoId?String(atual044.atendimentoId):null
  const[{data:atendimento,error:ea},{data:historico,error:eh}]=await Promise.all([
    atendimentoId?admin.from('atendimentos').select('id,status').eq('id',atendimentoId).single():Promise.resolve({data:null,error:null}),
    atendimentoId?admin.from('atendimento_status_eventos').select('status_anterior,status_novo,ocorrido_em').eq('atendimento_id',atendimentoId).eq('status_novo','concluido').order('ocorrido_em',{ascending:false}).limit(1):Promise.resolve({data:[],error:null}),
  ]);if(ea||eh)throw ea||eh
  const u={...unidade(item as L,[ocorrencia],atendimento?[atendimento]:[]),...atual044}
  return{status:'carregado',...u,servicoNome:String(contratoItem.servico_nome_snapshot),modalidade:String(ciclo.modalidade_transporte_pretendida),cicloNumero:Number(ciclo.numero),cicloEncerramentoPendente:Boolean(ciclo.encerramento_pendente),statusAnteriorConclusao:(historico?.[0]?.status_anterior as string|null)??null,eventos:(eventos??[]).map(e=>({id:String(e.id),tipo:String(e.tipo),estadoAnterior:e.estado_anterior?estado(e.estado_anterior):null,estadoNovo:estado(e.estado_novo),responsavelId:e.responsavel_id?String(e.responsavel_id):null,motivo:e.motivo?String(e.motivo):null,ocorridoEm:String(e.ocorrido_em)}))}
}

function unidade(item:L,ocorrencias:L[],atendimentos:L[]):UnidadeCredito{const o=ocorrencias.find(x=>String(x.id)===String(item.ocorrencia_id))??{},a=atendimentos.find(x=>String(x.id)===String(o.atendimento_id));return{ocorrenciaId:String(item.ocorrencia_id),contratoItemId:String(item.contrato_item_id),cicloId:String(item.ciclo_id),ordinal:Number(item.ordinal_no_item),ocorrenciaOrdem:Number(o.ordem),data:String(o.data_operacional??''),horarioInicio:String(o.horario_apresentado??'').slice(0,5),horarioFim:horaIso(o.conclusao_prevista),atendimentoId:o.atendimento_id?String(o.atendimento_id):null,statusAtendimento:a?String(a.status):null,estadoComercial:estado(item.estado_comercial),versao:Number(item.estado_comercial_versao)}}
function materializacao(ciclo:L){const valor=ciclo.materializacao_estado;return{materializacaoEstado:['pendente','materializando','materializado','erro'].includes(String(valor))?valor as 'pendente'|'materializando'|'materializado'|'erro':null,materializacaoTentativas:Number(ciclo.materializacao_tentativas??0),materializacaoUltimoCodigoErro:texto(ciclo.materializacao_ultimo_codigo_erro)||null,materializacaoUltimoErro:texto(ciclo.materializacao_ultimo_erro)||null,materializacaoUltimaTentativaEm:texto(ciclo.materializacao_ultima_tentativa_em)||null,materializacaoConcluidaEm:texto(ciclo.materializacao_concluida_em)||null}}
async function rpc(nome:string,payload:L,admin:SupabaseClient){const{data,error}=await admin.rpc(nome,{p_intencao:payload});if(error)throw error;return data}
function estado(v:unknown):EstadoCreditoContrato{if(!estadoCredito(v))throw new Error('Estado comercial inválido.');return v}
function texto(v:unknown){return typeof v==='string'?v:''}
function horaIso(v:unknown){if(typeof v!=='string'||!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(11,16)}

async function carregarComercial(contratoId:string,admin:SupabaseClient){
 const{data,error}=await admin.rpc('resumo_comercial_contrato_043',{p_contrato_id:contratoId});if(error)throw error
 const linhas=(data??[]) as {ciclo_id:string;comercialmente_concluido:boolean;elegivel_renovacao:boolean}[]
 return(id:string)=>{const x=linhas.find(l=>l.ciclo_id===id);return{comercialmenteConcluido:x?.comercialmente_concluido===true,elegivelRenovacao:x?.elegivel_renovacao===true}}
}

async function contexto044(cicloId:string,admin:SupabaseClient){const{data,error}=await admin.rpc('contexto_creditos_ciclo_044',{p_ciclo_id:cicloId});if(error||!Array.isArray(data))throw new Error('Contexto de creditos 044 indisponivel.');return new Map<string,UnidadeCredito>((data as L[]).map(x=>[String(x.ocorrenciaId)+':'+String(x.contratoItemId),x as unknown as UnidadeCredito]))}
function exigirContexto044(ctx:Map<string,UnidadeCredito>,ocorrencia:string,item:string){const x=ctx.get(ocorrencia+':'+item);if(!x)throw new Error('Unidade comercial sem contexto valido.');return x}
