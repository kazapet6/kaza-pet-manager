import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import type { IntencaoGerenciarPacote,Pacote,PacoteServico,RespostaGerenciarPacote,UnidadePeriodo } from '../../../frontend/src/pacotes/contrato.ts'
type Linha=Record<string,unknown>
const consulta='id,nome,ativo,versao,created_at,updated_at,pacote_servicos(id,servico_id,ordem_exibicao,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade,desconto_percentual,ativo,servicos(nome))'
export async function executarGerenciamentoPacote(intencao:IntencaoGerenciarPacote,admin:SupabaseClient):Promise<RespostaGerenciarPacote>{
  const{data,error}=await admin.rpc('salvar_pacote_completo',{p_intencao:intencao})
  if(error)throw new Error('Falha na persistencia atomica do pacote.')
  if(!data||typeof data!=='object')throw new Error('Resposta invalida da persistencia.')
  const resposta=data as Record<string,unknown>
  if(resposta.status!=='salvo')return resposta as RespostaGerenciarPacote
  const{data:linha,error:erroLeitura}=await admin.from('pacotes').select(consulta).eq('id',String(resposta.pacoteId)).single()
  if(erroLeitura||!linha)throw new Error('Pacote salvo, mas nao recarregado.')
  return{status:'salvo',pacote:mapearPacote(linha as unknown as Linha)}
}
function mapearPacote(l:Linha):Pacote{const itens=(Array.isArray(l.pacote_servicos)?l.pacote_servicos:[]).map((i)=>mapearServico(i as Linha)).filter((i)=>i.ativo).sort((a,b)=>a.ordem-b.ordem);return{id:String(l.id),nome:String(l.nome),ativo:Boolean(l.ativo),versao:Number(l.versao),configuracaoCompleta:itens.length>0&&itens.every(i=>i.descontoPercentual!==null),servicos:itens,criadoEm:String(l.created_at),atualizadoEm:String(l.updated_at)}}
function mapearServico(l:Linha):PacoteServico&{ativo:boolean}{const s=Array.isArray(l.servicos)?l.servicos[0]as Linha|undefined:l.servicos as Linha|undefined;return{id:String(l.id),servicoId:String(l.servico_id),servicoNome:String(s?.nome??''),ordem:Number(l.ordem_exibicao),quantidadePorCiclo:Number(l.quantidade_por_ciclo),intervaloQuantidade:Number(l.intervalo_quantidade),intervaloUnidade:l.intervalo_unidade as UnidadePeriodo,offsetInicialQuantidade:Number(l.offset_inicial_quantidade),offsetInicialUnidade:l.offset_inicial_unidade as UnidadePeriodo,descontoPercentual:l.desconto_percentual==null?null:Number(l.desconto_percentual),ativo:Boolean(l.ativo)}}
