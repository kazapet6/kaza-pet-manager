import type { EtapaPlanejada } from './tipos.ts'

export function rotuloEtapaComAcoplamentos(
  etapa: Pick<EtapaPlanejada, 'nome' | 'contribuicoesAcopladas'>,
  rotuloSemAcoplamento = etapa.nome,
) {
  if (!etapa.contribuicoesAcopladas.length) return rotuloSemAcoplamento
  return nomesUnicos([
    etapa.nome,
    ...etapa.contribuicoesAcopladas.map((item) => item.servicoNome),
  ]).join(' + ')
}

function nomesUnicos(nomes: string[]) {
  const vistos = new Set<string>()
  return nomes.filter((nome) => {
    const chave = nome.trim().toLocaleLowerCase('pt-BR')
    if (!chave || vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}
