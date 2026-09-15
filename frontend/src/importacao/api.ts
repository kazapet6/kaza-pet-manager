import { supabase } from '../lib/supabase.ts'
import type { Lote } from './modelo.ts'
import type { RacaImportacao } from './csv.ts'
import type { ResolucaoRacaLote } from './sugestoesRacas.ts'
export async function catalogoImportacao():Promise<RacaImportacao[]> {
  const {data,error}=await supabase.from('racas').select('id,nome,especie,ativo,sinonimos:raca_sinonimos(nome,ativo)').order('nome')
  if(error) throw new Error('Não foi possível consultar o catálogo de raças.')
  return (data||[]).map(r=>({...r,sinonimos:r.sinonimos.filter(s=>s.ativo).map(s=>s.nome)}))
}
async function rpc(nome:string,args:Record<string,unknown>):Promise<Lote> {
  const {data,error}=await supabase.rpc(nome,args)
  if(error) throw new Error(error.code==='PGRST202'?`Operação de importação ainda não instalada no banco. A Migration ${nome==='importacao_resolver_racas_lote'?'038':'036'} precisa ser aplicada em etapa autorizada.`:'Operação não concluída. Reabra o lote para conferir sua revisão; nenhuma conclusão foi presumida.')
  return data as Lote
}
export const salvarLote=(l:Lote)=>rpc('importacao_salvar_lote',{p_documento:l})
export const obterLote=(id:string)=>rpc('importacao_obter_lote',{p_id:id})
export const promoverLote=(l:Lote)=>rpc('importacao_promover_lote',{p_id:l.id,p_revisao:l.revisao,p_confirmar:true})
export const resolverRacasLote=(lote:string,revisao:number,itens:ResolucaoRacaLote[])=>rpc('importacao_resolver_racas_lote',{p_lote:lote,p_revisao:revisao,p_grupos:itens,p_confirmar:true})
export async function listarLotes() {
  const {data,error}=await supabase.from('importacao_lotes').select('id,origem,status,created_at').order('created_at',{ascending:false}).limit(50)
  if(error) throw new Error('Não foi possível consultar lotes. Verifique se a Migration 036 já foi instalada.')
  return data||[]
}
export async function aplicarMapeamentos(l:Lote):Promise<Lote> {
  const {data,error}=await supabase.from('importacao_mapeamentos').select('tipo_entidade,external_id,cliente_id,pet_id').eq('origem',l.origem).limit(20000)
  if(error) throw new Error('Preview local disponível, mas idempotência remota ainda não foi consultada. Instale a 036 antes de salvar.')
  return {...l,clientes:l.clientes.map(c=>({...c,internal_id:data.find(m=>m.tipo_entidade==='cliente'&&m.external_id===c.external_id)?.cliente_id||null})),pets:l.pets.map(p=>({...p,internal_id:data.find(m=>m.tipo_entidade==='pet'&&m.external_id===p.external_id)?.pet_id||null}))}
}
export async function criarRaca(lote:string,nome:string,especie:string) {
  const {data,error}=await supabase.rpc('importacao_criar_raca',{p_lote:lote,p_nome:nome,p_especie:especie,p_confirmar:true})
  if(error) throw new Error('Raça não criada. Confira nome, espécie e possível cadastro existente antes de repetir.')
  return data as string
}
