import type { IntervaloMinutos } from './tipos.ts'

export function horaParaMinutos(valor: string) {
  const [hora, minuto] = valor.slice(0, 5).split(':').map(Number)
  return hora * 60 + minuto
}

export function minutosParaHora(valor: number) {
  return `${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`
}

export function diaSemana(data: string) {
  return new Date(`${data}T12:00:00Z`).getUTCDay()
}

export function sobrepoe(a: IntervaloMinutos, b: IntervaloMinutos) {
  return a.inicio < b.fim && b.inicio < a.fim
}

export function contem(bloco: IntervaloMinutos, periodo: IntervaloMinutos) {
  return periodo.inicio >= bloco.inicio && periodo.fim <= bloco.fim
}

export function intersecao(a: IntervaloMinutos, b: IntervaloMinutos) {
  return Math.max(a.inicio, b.inicio) < Math.min(a.fim, b.fim)
}

export function combinacoes<T>(itens: T[], quantidade: number): T[][] {
  if (quantidade === 0) return [[]]
  if (itens.length < quantidade) return []
  const resultado: T[][] = []
  for (let indice = 0; indice <= itens.length - quantidade; indice += 1) {
    for (const restante of combinacoes(itens.slice(indice + 1), quantidade - 1)) resultado.push([itens[indice], ...restante])
  }
  return resultado
}
