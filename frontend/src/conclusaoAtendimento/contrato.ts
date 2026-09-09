export const FORMAS_PAGAMENTO = ['pix','dinheiro','debito','credito','outro'] as const
export type FormaPagamento = typeof FORMAS_PAGAMENTO[number]
export type SituacaoFinanceira = 'pendente'|'parcial'|'pago'|'isento'
export type Recebimento = { id:string; valor:number; formaPagamento:FormaPagamento; recebidoEm:string }
export type FinanceiroAtendimento = { valorFinal:number; totalRecebido:number; saldo:number; situacao:SituacaoFinanceira; isento:boolean; versao:number; recebimentos:Recebimento[] }
export type ServicoRetorno = { atendimentoServicoId:string; nome:string; intervaloDias:number|null; dataRecomendada:string|null }
export type DadosConclusao = { atendimentoId:string; financeiro:FinanceiroAtendimento; retornosVersao:number; retornos:ServicoRetorno[] }
export type ConclusaoDadosIntent =
 | { operacao:'carregar'; atendimentoId:string }
 | { operacao:'receber'; atendimentoId:string; chaveIdempotencia:string; valor:number; formaPagamento:FormaPagamento }
 | { operacao:'isentar'; atendimentoId:string; versaoEsperada:number; isento:boolean }
 | { operacao:'salvar_retornos'; atendimentoId:string; versaoEsperada:number; recomendacoes:{ atendimentoServicoId:string; intervaloDias:number }[] }
export type ConclusaoDadosResposta = ({status:'carregado'}&DadosConclusao)|{status:'registrado'|'atualizado'|'salvo';[chave:string]:unknown}|{status:'conflito'|'invalido';codigo:string;mensagem:string}
export function situacaoFinanceira(valorFinal:number,total:number,isento:boolean):SituacaoFinanceira { if(isento)return'isento'; if(total===0)return'pendente'; return total>=valorFinal?'pago':'parcial' }
export function podeAbrirConclusao(status:string){return status==='aguardando_retirada'||status==='aguardando_entrega'}
export function dataRetorno(data:string,dias:number){const d=new Date(`${data}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10)}
export function lerConclusaoDadosIntent(v:unknown):ConclusaoDadosIntent|null{if(!obj(v)||typeof v.atendimentoId!=='string'||!v.atendimentoId)return null;if(v.operacao==='carregar')return{operacao:'carregar',atendimentoId:v.atendimentoId};if(v.operacao==='receber'&&typeof v.chaveIdempotencia==='string'&&typeof v.valor==='number'&&v.valor>0&&FORMAS_PAGAMENTO.includes(v.formaPagamento as FormaPagamento))return{operacao:'receber',atendimentoId:v.atendimentoId,chaveIdempotencia:v.chaveIdempotencia,valor:v.valor,formaPagamento:v.formaPagamento as FormaPagamento};if(v.operacao==='isentar'&&Number.isSafeInteger(v.versaoEsperada)&&typeof v.isento==='boolean')return{operacao:'isentar',atendimentoId:v.atendimentoId,versaoEsperada:Number(v.versaoEsperada),isento:v.isento};if(v.operacao==='salvar_retornos'&&Number.isSafeInteger(v.versaoEsperada)&&Array.isArray(v.recomendacoes)&&v.recomendacoes.every(x=>obj(x)&&typeof x.atendimentoServicoId==='string'&&Number.isInteger(x.intervaloDias)&&Number(x.intervaloDias)>=1&&Number(x.intervaloDias)<=3650))return{operacao:'salvar_retornos',atendimentoId:v.atendimentoId,versaoEsperada:Number(v.versaoEsperada),recomendacoes:v.recomendacoes as {atendimentoServicoId:string;intervaloDias:number}[]};return null}function obj(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v)}
