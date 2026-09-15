export const unidadesPeriodo = ['dia', 'semana', 'mes', 'ano'] as const
export type UnidadePeriodo = typeof unidadesPeriodo[number]
export type PacoteServico = {
  readonly id?: string; readonly servicoId: string; readonly servicoNome?: string; readonly ordem: number
  readonly quantidadePorCiclo: number; readonly intervaloQuantidade: number; readonly intervaloUnidade: UnidadePeriodo
  readonly offsetInicialQuantidade: number; readonly offsetInicialUnidade: UnidadePeriodo
  readonly descontoPercentual: number | null
}
export type Pacote = {
  readonly id: string; readonly nome: string; readonly ativo: boolean; readonly versao: number
  readonly configuracaoCompleta: boolean; readonly servicos: PacoteServico[]
  readonly criadoEm: string; readonly atualizadoEm: string
}
export type IntencaoGerenciarPacote = {
  readonly operacao: 'criar' | 'editar'; readonly chaveIdempotencia: string
  readonly pacoteId?: string; readonly versaoEsperada?: number; readonly nome: string
  readonly ativo: boolean; readonly servicos: PacoteServico[]
}
export type RespostaGerenciarPacote =
  | { readonly status: 'salvo'; readonly pacote: Pacote }
  | { readonly status: 'conflito'; readonly codigo: 'VERSAO_DIVERGENTE'; readonly mensagem: string }
  | { readonly status: 'invalido'; readonly codigo: string; readonly mensagem: string }
export type LinhaSimulacaoPacote = { readonly pacoteServicoId: string; readonly servicoId: string; readonly servicoNome: string; readonly quantidadePorCiclo: number; readonly descontoPercentual:number; readonly precoAvulsoUnitario: number; readonly precoPacoteUnitario: number; readonly totalAvulso: number; readonly totalPacote: number; readonly economia: number }
export type SimulacaoPacote = { readonly pacoteId: string; readonly pacoteVersao: number; readonly linhas: LinhaSimulacaoPacote[]; readonly totalAvulso: number; readonly totalPacote: number; readonly economiaAbsoluta: number; readonly percentualEconomia: number | null }
export type RespostaSimulacaoPacote = { readonly status: 'calculado'; readonly simulacao: SimulacaoPacote } | { readonly status: 'conflito' | 'invalido'; readonly codigo: string; readonly mensagem: string; readonly campos?: readonly string[] }

export function rotuloUnidade(unidade: UnidadePeriodo, quantidade: number) {
  const plural: Record<UnidadePeriodo,string> = { dia:'dias',semana:'semanas',mes:'meses',ano:'anos' }
  const singular: Record<UnidadePeriodo,string> = { dia:'dia',semana:'semana',mes:'mês',ano:'ano' }
  return quantidade === 1 ? singular[unidade] : plural[unidade]
}
export function descreverRecorrencia(item: Pick<PacoteServico,'intervaloQuantidade'|'intervaloUnidade'>) { return `A cada ${item.intervaloQuantidade} ${rotuloUnidade(item.intervaloUnidade,item.intervaloQuantidade)}` }
export function lerIntencaoGerenciarPacote(valor: unknown): IntencaoGerenciarPacote | null {
  if (!objeto(valor)) return null
  const nome = typeof valor.nome === 'string' ? valor.nome.trim() : ''
  const origem = Array.isArray(valor.servicos) ? valor.servicos : null
  const servicos = origem?.map(lerServico).filter((item): item is PacoteServico => item !== null) ?? []
  if ((valor.operacao !== 'criar' && valor.operacao !== 'editar') || !nome || nome.length > 120 || typeof valor.ativo !== 'boolean' || !uuid(valor.chaveIdempotencia) || !origem || servicos.length !== origem.length || (valor.ativo && !servicos.length)) return null
  if (valor.operacao === 'editar' && (!uuid(valor.pacoteId) || !inteiro(valor.versaoEsperada,0))) return null
  return { operacao:valor.operacao,chaveIdempotencia:valor.chaveIdempotencia,pacoteId:valor.operacao==='editar'?valor.pacoteId as string:undefined,versaoEsperada:valor.operacao==='editar'?valor.versaoEsperada as number:undefined,nome,ativo:valor.ativo,servicos }
}
function lerServico(valor: unknown): PacoteServico | null {
  if (!objeto(valor) || !uuid(valor.servicoId) || !inteiro(valor.ordem,1) || !inteiro(valor.quantidadePorCiclo,1) || !inteiro(valor.intervaloQuantidade,1) || !unidade(valor.intervaloUnidade) || !inteiro(valor.offsetInicialQuantidade,0) || !unidade(valor.offsetInicialUnidade) || !percentual(valor.descontoPercentual)) return null
  return{servicoId:valor.servicoId,ordem:valor.ordem,quantidadePorCiclo:valor.quantidadePorCiclo,intervaloQuantidade:valor.intervaloQuantidade,intervaloUnidade:valor.intervaloUnidade,offsetInicialQuantidade:valor.offsetInicialQuantidade,offsetInicialUnidade:valor.offsetInicialUnidade,descontoPercentual:valor.descontoPercentual}
}
function objeto(v:unknown):v is Record<string,unknown>{return Boolean(v)&&typeof v==='object'&&!Array.isArray(v)}
function inteiro(v:unknown,minimo:number):v is number{return typeof v==='number'&&Number.isSafeInteger(v)&&v>=minimo}
function percentual(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100&&Math.round(v*100)===v*100}
function unidade(v:unknown):v is UnidadePeriodo{return unidadesPeriodo.includes(v as UnidadePeriodo)}
function uuid(v:unknown):v is string{return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)}
