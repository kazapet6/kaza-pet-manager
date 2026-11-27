/** Procedimentos inclusos são instruções operacionais, nunca itens de cobrança. */
export const ROTULOS_PROCEDIMENTOS = {
  tosa_higienica: 'Tosa higiênica',
  limpeza_ouvidos: 'Limpeza de ouvidos',
  corte_unhas: 'Corte de unhas',
} as const
export type CodigoProcedimento = keyof typeof ROTULOS_PROCEDIMENTOS
export type ServicoProcedimentos = {
  id: string
  nome: string
  procedimentoInclusoEmServicoId?: string | null
  procedimentoAvulsoCodigo?: CodigoProcedimento | null
  procedimentosInclusos?: CodigoProcedimento[]
}
export function codigoProcedimento(valor: unknown): CodigoProcedimento | null {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(ROTULOS_PROCEDIMENTOS, valor)
    ? valor as CodigoProcedimento : null
}
export function normalizarProcedimentos(valor: unknown): CodigoProcedimento[] {
  if (!Array.isArray(valor)) return []
  const codigos = new Set(valor.map(codigoProcedimento).filter((v): v is CodigoProcedimento => v !== null))
  return (Object.keys(ROTULOS_PROCEDIMENTOS) as CodigoProcedimento[]).filter(c => codigos.has(c))
}
export function procedimentosDoPlano(servicos: readonly Pick<ServicoProcedimentos, 'procedimentosInclusos'>[]) {
  return normalizarProcedimentos(servicos.flatMap(s => s.procedimentosInclusos ?? []))
}
export class ErroProcedimentoIncluso extends Error {
  constructor(avulso: string, principal: string) {
    super(`${avulso} já está incluso em ${principal}. Remova o serviço avulso.`)
    this.name = 'ErroProcedimentoIncluso'
  }
}
export function validarProcedimentosInclusos(servicos: readonly ServicoProcedimentos[]) {
  for (const avulso of servicos) {
    const principal = servicos.find(s => s.id !== avulso.id && (
      s.id === avulso.procedimentoInclusoEmServicoId ||
      (avulso.procedimentoAvulsoCodigo != null && s.procedimentosInclusos?.includes(avulso.procedimentoAvulsoCodigo))
    ))
    if (principal) throw new ErroProcedimentoIncluso(avulso.nome, principal.nome)
  }
}
