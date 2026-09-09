import { supabase } from '../lib/supabase'
import type { Pet } from '../types/Pet'

export type DadosPet = Omit<Pet, 'id' | 'criadoEm' | 'racaNome'>

type PetRow = {
  id: string
  cliente_id: string
  nome: string
  especie: Pet['especie']
  raca_id: string
  raca: { id: string; nome: string } | { id: string; nome: string }[]
  sexo: Pet['sexo']
  porte: Pet['porte']
  pelagem: Pet['pelagem']
  peso: number | null
  cor: string
  data_nascimento: string
  castrado: boolean
  temperamento: Pet['temperamento']
  observacoes: string
  created_at: string
}

function paraPet(row: PetRow): Pet {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nome: row.nome,
    especie: row.especie,
    racaId: row.raca_id,
    racaNome: Array.isArray(row.raca) ? row.raca[0]?.nome ?? '' : row.raca.nome,
    sexo: row.sexo,
    porte: row.porte,
    pelagem: row.pelagem,
    peso: row.peso,
    cor: row.cor,
    dataNascimento: row.data_nascimento,
    castrado: row.castrado,
    temperamento: row.temperamento,
    observacoes: row.observacoes,
    criadoEm: row.created_at,
  }
}

function paraRegistro(pet: DadosPet) {
  return {
    cliente_id: pet.clienteId,
    nome: pet.nome,
    especie: pet.especie,
    raca_id: pet.racaId,
    sexo: pet.sexo,
    porte: pet.porte,
    pelagem: pet.pelagem,
    peso: pet.peso,
    cor: pet.cor,
    data_nascimento: pet.dataNascimento,
    castrado: pet.castrado,
    temperamento: pet.temperamento,
    observacoes: pet.observacoes,
  }
}

export async function listarPets() {
  const { data, error } = await supabase
    .from('pets')
    .select('*, raca:racas!pets_raca_especie_fkey(id, nome)')
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as PetRow[]).map(paraPet)
}

export async function inserirPet(pet: DadosPet) {
  const { data, error } = await supabase
    .from('pets')
    .insert(paraRegistro(pet))
    .select('*, raca:racas!pets_raca_especie_fkey(id, nome)')
    .single()

  if (error) throw error

  return paraPet(data as PetRow)
}

export async function editarPet(id: string, pet: DadosPet) {
  const { data, error } = await supabase
    .from('pets')
    .update(paraRegistro(pet))
    .eq('id', id)
    .select('*, raca:racas!pets_raca_especie_fkey(id, nome)')
    .single()

  if (error) throw error

  return paraPet(data as PetRow)
}
