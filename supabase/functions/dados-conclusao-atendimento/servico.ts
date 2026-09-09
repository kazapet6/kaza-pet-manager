import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { situacaoFinanceira,type ConclusaoDadosIntent,type ConclusaoDadosResposta,type FormaPagamento } from '../../../frontend/src/conclusaoAtendimento/contrato.ts'
export async function executarDadosConclusaoBackend(i:ConclusaoDadosIntent,admin:SupabaseClient):Promise<ConclusaoDadosResposta>{
 if(i.operacao==='carregar')return carregar(i.atendimentoId,admin)
 const rpc=i.operacao==='receber'?'registrar_recebimento_atendimento':i.operacao==='isentar'?'definir_isencao_atendimento':'salvar_retornos_atendimento'
 const {data,error}=await admin.rpc(rpc,{p_payload:i});if(error)throw error;return data as ConclusaoDadosResposta
}
async function carregar(id:string,admin:SupabaseClient):Promise<ConclusaoDadosResposta>{
 const [a,f,r,s]=await Promise.all([
  admin.from('atendimentos').select('id,valor_final,retornos_versao').eq('id',id).maybeSingle(),
  admin.from('atendimento_financeiro').select('isento,versao').eq('atendimento_id',id).maybeSingle(),
  admin.from('atendimento_recebimentos').select('id,valor,forma_pagamento,recebido_em').eq('atendimento_id',id).order('recebido_em'),
  admin.from('atendimento_servicos').select('id,nome_snapshot,atendimento_recomendacoes_retorno(intervalo_dias,data_recomendada)').eq('atendimento_id',id).order('ordem')])
 const erro=a.error||f.error||r.error||s.error;if(erro)throw erro;if(!a.data)return{status:'invalido',codigo:'ATENDIMENTO_NAO_ENCONTRADO',mensagem:'Atendimento nao encontrado.'}
 const recebimentos=(r.data??[]).map(x=>({id:x.id,valor:Number(x.valor),formaPagamento:x.forma_pagamento as FormaPagamento,recebidoEm:x.recebido_em}));const total=recebimentos.reduce((n,x)=>n+x.valor,0);const valor=Number(a.data.valor_final);const isento=Boolean(f.data?.isento)
 return{status:'carregado',atendimentoId:id,financeiro:{valorFinal:valor,totalRecebido:total,saldo:isento?0:valor-total,situacao:situacaoFinanceira(valor,total,isento),isento,versao:Number(f.data?.versao??0),recebimentos},retornosVersao:Number(a.data.retornos_versao),retornos:(s.data??[]).map(x=>{const rel=Array.isArray(x.atendimento_recomendacoes_retorno)?x.atendimento_recomendacoes_retorno[0]:x.atendimento_recomendacoes_retorno;return{atendimentoServicoId:x.id,nome:x.nome_snapshot,intervaloDias:rel?.intervalo_dias??null,dataRecomendada:rel?.data_recomendada??null}})}
}
