import { supabase } from '../lib/supabase.ts'
import { carregarDadosDisponibilidadeComCliente } from './supabase.ts'
import type { EntradaDisponibilidade } from './tipos.ts'

export function carregarDadosDisponibilidade(entrada: EntradaDisponibilidade) {
  return carregarDadosDisponibilidadeComCliente(entrada, supabase)
}
