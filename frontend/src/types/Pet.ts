export type Pet = {
  id: string
  clienteId: string
  nome: string
  especie: 'cao' | 'gato'
  racaId: string
  racaNome: string
  sexo: 'macho' | 'femea'
  porte: 'mini' | 'pequeno' | 'medio' | 'grande' | 'gigante'
  pelagem: 'curta' | 'media' | 'longa'
  peso: number | null
  cor: string
  dataNascimento: string
  castrado: boolean
  temperamento: 'calmo' | 'moderado' | 'dificil'
  observacoes: string
  criadoEm: string
}

export type Raca = {
  id: string
  especie: Pet['especie']
  nome: string
  ativo: boolean
  sinonimos: { nome: string; ativo: boolean }[]
}
