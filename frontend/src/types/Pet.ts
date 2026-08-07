export type Pet = {
  id: string
  clienteId: string
  nome: string
  especie: 'cao' | 'gato'
  raca: string
  sexo: 'macho' | 'femea'
  porte: 'mini' | 'pequeno' | 'medio' | 'grande' | 'gigante'
  peso: number | null
  cor: string
  dataNascimento: string
  castrado: boolean
  observacoes: string
  criadoEm: string
}