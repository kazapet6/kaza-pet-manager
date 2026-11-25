import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { situacaoFinanceira,type ConclusaoDadosIntent,type ConclusaoDadosResposta,type FinanceiroAtendimento,type FormaPagamento,type Recebimento,type SituacaoFinanceira } from '../../../frontend/src/conclusaoAtendimento/contrato.ts'
type FinanceiroPacote = { cicloId:string; valor:number; situacao:SituacaoFinanceira; recebimento:Recebimento|null }

async function carregarFinanceiroPacote(atendimentoId:string,admin:SupabaseClient):Promise<FinanceiroPacote|null>{
 const {data,error}=await admin.rpc('financeiro_pacote_045',{p_atendimento_id:atendimentoId})
 if(error)throw error
 return data as FinanceiroPacote|null
}

export async function executarDadosConclusaoBackend(i:ConclusaoDadosIntent,admin:SupabaseClient,usuarioId:string):Promise<ConclusaoDadosResposta>{
 if(i.operacao==='carregar')return carregar(i.atendimentoId,admin)
 const pacote = i.operacao==='salvar_retornos' ? null : await carregarFinanceiroPacote(i.atendimentoId,admin)
 if(i.operacao==='receber' && i.destino==='adicionais' && !pacote)return {status:'invalido',codigo:'PACOTE_NAO_ENCONTRADO',mensagem:'Atendimento de pacote não encontrado.'}
 if(pacote && (i.operacao==='isentar' || (i.operacao==='receber' && i.destino!=='adicionais'))){
  if(i.operacao==='isentar')return {status:'invalido',codigo:'ISENCAO_PACOTE_INDISPONIVEL',mensagem:'O pagamento do ciclo não pode ser alterado pela isenção de atendimento.'}
  const {data,error}=await admin.rpc('receber_pacote_045',{p_payload:{...i,usuarioId}})
  if(error)throw error
  return data as ConclusaoDadosResposta
 }
 const rpc=i.operacao==='receber'?'registrar_recebimento_atendimento':i.operacao==='isentar'?'definir_isencao_atendimento':'salvar_retornos_atendimento'
 const {data,error}=await admin.rpc(rpc,{p_payload:i});if(error)throw error;return data as ConclusaoDadosResposta
}
async function carregar(id:string,admin:SupabaseClient):Promise<ConclusaoDadosResposta>{
 const [a,f,r,s,pacote]=await Promise.all([
  admin.from('atendimentos').select('id,valor_calculado,valor_final,retornos_versao').eq('id',id).maybeSingle(),
  admin.from('atendimento_financeiro').select('isento,versao').eq('atendimento_id',id).maybeSingle(),
  admin.from('atendimento_recebimentos').select('id,valor,forma_pagamento,recebido_em').eq('atendimento_id',id).order('recebido_em'),
  admin.from('atendimento_servicos').select('id,nome_snapshot,ativo,adicional_pacote,valor_calculado,valor_final,atendimento_recomendacoes_retorno(intervalo_dias,data_recomendada)').eq('atendimento_id',id).order('ordem'),
  carregarFinanceiroPacote(id,admin)])
 const erro=a.error||f.error||r.error||s.error;if(erro)throw erro;if(!a.data)return{status:'invalido',codigo:'ATENDIMENTO_NAO_ENCONTRADO',mensagem:'Atendimento nao encontrado.'}
 const recebimentos=(r.data??[]).map(x=>({id:x.id,valor:Number(x.valor),formaPagamento:x.forma_pagamento as FormaPagamento,recebidoEm:x.recebido_em}));const total=recebimentos.reduce((n,x)=>n+x.valor,0);const valor=Number(a.data.valor_final);const isento=Boolean(f.data?.isento)
 const extras=(s.data??[]).filter(item=>item.ativo && item.adicional_pacote)
 const totalExtra=extras.reduce((acc,item)=>acc+Math.round(Number(item.valor_final)*100),0)/100
 const originalExtra=extras.reduce((acc,item)=>acc+Math.round(Number(item.valor_calculado)*100),0)/100
 const adicionais:FinanceiroAtendimento | undefined = extras.length ? { valorFinal:totalExtra,valorOriginal:originalExtra,
   saldo:Math.max(0,Math.round((totalExtra-total)*100)/100),totalRecebido:total,situacao:totalExtra===0?'pago':situacaoFinanceira(totalExtra,total,false),
   isento:false,versao:Number(f.data?.versao??0),recebimentos } : undefined
 const financeiro:FinanceiroAtendimento=pacote
  ? {cicloPacoteId:pacote.cicloId,adicionais,valorFinal:pacote.valor,totalRecebido:pacote.recebimento?.valor??0,saldo:pacote.situacao==='pago'?0:pacote.valor,situacao:pacote.situacao,isento:false,versao:0,recebimentos:pacote.recebimento?[pacote.recebimento]:[]}
  : {valorFinal:valor,valorOriginal:Number(a.data.valor_calculado),totalRecebido:total,saldo:isento?0:valor-total,situacao:situacaoFinanceira(valor,total,isento),isento,versao:Number(f.data?.versao??0),recebimentos}
 return{status:'carregado',atendimentoId:id,financeiro,retornosVersao:Number(a.data.retornos_versao),retornos:(s.data??[]).map(x=>{const rel=Array.isArray(x.atendimento_recomendacoes_retorno)?x.atendimento_recomendacoes_retorno[0]:x.atendimento_recomendacoes_retorno;return{atendimentoServicoId:x.id,nome:x.nome_snapshot,intervaloDias:rel?.intervalo_dias??null,dataRecomendada:rel?.data_recomendada??null}})}
}
