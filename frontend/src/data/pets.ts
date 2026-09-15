import { supabase } from '../lib/supabase.ts'
import { paraPet, paraRegistro, type DadosPet, type PetRow } from './petsMapeamento.ts'
export type { DadosPet } from './petsMapeamento.ts'

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
