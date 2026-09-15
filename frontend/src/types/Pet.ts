export type EspeciePet = 'cao' | 'gato'
export type SexoPet = 'macho' | 'femea'
export type PortePet = 'mini' | 'pequeno' | 'medio' | 'grande' | 'gigante'
export type PelagemPet = 'curta' | 'media' | 'longa'
export type TemperamentoPet = 'calmo' | 'moderado' | 'dificil'

export type Pet = {
  id: string
  clienteId: string
  nome: string
  especie: EspeciePet | null
  racaId: string | null
  racaNome: string | null
  sexo: SexoPet | null
  porte: PortePet | null
  pelagem: PelagemPet | null
  peso: number | null
  cor: string
  dataNascimento: string
  castrado: boolean | null
  temperamento: TemperamentoPet | null
  observacoes: string
  criadoEm: string
}

export type Raca = {
  id: string
  especie: EspeciePet
  nome: string
  ativo: boolean
  sinonimos: { nome: string; ativo: boolean }[]
}
