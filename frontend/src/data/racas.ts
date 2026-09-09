import { supabase } from '../lib/supabase'
import type { Raca } from '../types/Pet'

export async function listarRacas() {
  const { data, error } = await supabase
    .from('racas')
    .select('id, especie, nome, ativo, sinonimos:raca_sinonimos(nome, ativo)')
    .order('nome')

  if (error) throw error
  return data as Raca[]
}
