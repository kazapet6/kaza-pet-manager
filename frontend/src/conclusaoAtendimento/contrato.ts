import type { FormaPagamentoPrevista } from '../confirmacao/contrato.ts'

export const FORMAS_PAGAMENTO = ['pix','dinheiro','debito','credito','outro'] as const
export type FormaPagamento = typeof FORMAS_PAGAMENTO[number]
export type SituacaoFinanceira = 'pendente'|'parcial'|'pago'|'isento'
export type Recebimento = { id:string; valor:number; formaPagamento:FormaPagamento; recebidoEm:string; dataEfetiva?:string|null; registradoEm?:string; registradoPor?:string|null }
export type FinanceiroAtendimento = { formaPagamentoPrevista?: FormaPagamentoPrevista | null; valorFinal:number; valorOriginal?:number; totalRecebido:number; saldo:number; situacao:SituacaoFinanceira; isento:boolean; versao:number; recebimentos:Recebimento[]; cicloPacoteId?:string; adicionais?:FinanceiroAtendimento }
export type ServicoRetorno = { atendimentoServicoId:string; nome:string; intervaloDias:number|null; dataRecomendada:string|null }
export type DadosConclusao = { atendimentoId:string; financeiro:FinanceiroAtendimento; retornosVersao:number; retornos:ServicoRetorno[] }
export type ConclusaoDadosIntent =
 | { operacao:'carregar'; atendimentoId:string }
 | { operacao:'receber'; atendimentoId:string; chaveIdempotencia:string; valor:number; formaPagamento:FormaPagamento; destino?:'adicionais'; dataEfetiva?:string }
 | { operacao:'alterar_forma_prevista'; atendimentoId:string; versaoEsperada:number; formaPagamentoPrevista:FormaPagamentoPrevista|null }
 | { operacao:'isentar'; atendimentoId:string; versaoEsperada:number; isento:boolean }
 | { operacao:'salvar_retornos'; atendimentoId:string; versaoEsperada:number; recomendacoes:{ atendimentoServicoId:string; intervaloDias:number }[] }
export type ConclusaoDadosResposta = ({status:'carregado'}&DadosConclusao)|{status:'registrado'|'atualizado'|'salvo';[chave:string]:unknown}|{status:'conflito'|'invalido';codigo:string;mensagem:string}
export function situacaoFinanceira(valorFinal:number,total:number,isento:boolean):SituacaoFinanceira { if(isento)return'isento'; if(total===0)return'pendente'; return total>=valorFinal?'pago':'parcial' }
export function podeAbrirConclusao(status:string){return status==='aguardando_retirada'||status==='aguardando_entrega'}
export function dataRetorno(data:string,dias:number){const d=new Date(`${data}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+dias);return d.toISOString().slice(0,10)}
export function hojeFinanceiro(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora)
  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? ''
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}
export function dataEfetivaValida(valor: unknown, hoje = hojeFinanceiro()): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.slice(0,4) === '0000' || valor > hoje) return false
  const d = new Date(`${valor}T00:00:00.000Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === valor
}
export function lerConclusaoDadosIntent(v:unknown):ConclusaoDadosIntent|null{if(!obj(v)||typeof v.atendimentoId!=='string'||!v.atendimentoId)return null;if(v.operacao==='alterar_forma_prevista' && Number.isSafeInteger(v.versaoEsperada) && Number(v.versaoEsperada)>=0 && (v.formaPagamentoPrevista===null || v.formaPagamentoPrevista==='dinheiro' || v.formaPagamentoPrevista==='pix' || v.formaPagamentoPrevista==='cartao')) return {operacao:'alterar_forma_prevista',atendimentoId:v.atendimentoId,versaoEsperada:Number(v.versaoEsperada),formaPagamentoPrevista:v.formaPagamentoPrevista};if(v.operacao==='carregar')return{operacao:'carregar',atendimentoId:v.atendimentoId};if(v.operacao==='receber'&&typeof v.chaveIdempotencia==='string'&&typeof v.valor==='number'&&Number.isFinite(v.valor)&&v.valor>0&&(v.dataEfetiva===undefined||dataEfetivaValida(v.dataEfetiva))&&FORMAS_PAGAMENTO.includes(v.formaPagamento as FormaPagamento))return{operacao:'receber',atendimentoId:v.atendimentoId,chaveIdempotencia:v.chaveIdempotencia,valor:v.valor,formaPagamento:v.formaPagamento as FormaPagamento,...(v.destino==='adicionais'?{destino:'adicionais' as const}:{}),...(typeof v.dataEfetiva==='string'?{dataEfetiva:v.dataEfetiva}:{})};if(v.operacao==='isentar'&&Number.isSafeInteger(v.versaoEsperada)&&typeof v.isento==='boolean')return{operacao:'isentar',atendimentoId:v.atendimentoId,versaoEsperada:Number(v.versaoEsperada),isento:v.isento};if(v.operacao==='salvar_retornos'&&Number.isSafeInteger(v.versaoEsperada)&&Array.isArray(v.recomendacoes)&&v.recomendacoes.every(x=>obj(x)&&typeof x.atendimentoServicoId==='string'&&Number.isInteger(x.intervaloDias)&&Number(x.intervaloDias)>=1&&Number(x.intervaloDias)<=3650))return{operacao:'salvar_retornos',atendimentoId:v.atendimentoId,versaoEsperada:Number(v.versaoEsperada),recomendacoes:v.recomendacoes as {atendimentoServicoId:string;intervaloDias:number}[]};return null}function obj(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v)}
