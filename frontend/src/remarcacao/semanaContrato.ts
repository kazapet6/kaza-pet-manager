// Datas civis locais, independentes de fuso/horario de verao.
function diaCivil(data: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida.')
  const ms = Date.parse(data + 'T00:00:00.000Z')
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== data) throw new Error('Data inválida.')
  return ms / 86_400_000
}
function segunda(dia: number): number { return dia - ((dia + 3) % 7 + 7) % 7 }
export function mesmaSemanaContrato(original: string, destino: string): boolean {
  try { return segunda(diaCivil(original)) === segunda(diaCivil(destino)) } catch { return false }
}
export function datasPuloContrato(dataAtual: string, diaSemanaFixo: number, periodicidadeDias: 7 | 14, quantidade: number): string[] {
  if (!Number.isInteger(diaSemanaFixo) || diaSemanaFixo < 0 || diaSemanaFixo > 6 ||
      ![7,14].includes(periodicidadeDias) || !Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 366) throw new Error('Rotina inválida.')
  const primeira = segunda(diaCivil(dataAtual)) + 7 + (diaSemanaFixo + 6) % 7
  return Array.from({length: quantidade}, (_, i) => new Date((primeira+i*periodicidadeDias)*86_400_000).toISOString().slice(0,10))
}
