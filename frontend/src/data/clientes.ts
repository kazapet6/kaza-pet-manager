import { supabase } from '../lib/supabase'
import type { Cliente } from '../types/Cliente'

type DadosCliente = Omit<Cliente, 'id' | 'criadoEm'>

type ClienteRow = {
  id: string
  nome: string
  whatsapp: string
  endereco: string
  bairro: string
  cidade: string
  observacoes: string
  created_at: string
}

function paraCliente(row: ClienteRow): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    whatsapp: row.whatsapp,
    endereco: row.endereco,
    bairro: row.bairro,
    cidade: row.cidade,
    observacoes: row.observacoes,
    criadoEm: row.created_at,
  }
}

function paraRegistro(cliente: DadosCliente) {
  return {
    nome: cliente.nome,
    whatsapp: cliente.whatsapp,
    endereco: cliente.endereco,
    bairro: cliente.bairro,
    cidade: cliente.cidade,
    observacoes: cliente.observacoes,
  }
}

export async function listarClientes() {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as ClienteRow[]).map(paraCliente)
}

export async function inserirCliente(cliente: DadosCliente) {
  const { data, error } = await supabase
    .from('clientes')
    .insert(paraRegistro(cliente))
    .select('*')
    .single()

  if (error) throw error

  return paraCliente(data as ClienteRow)
}

export async function editarCliente(id: string, cliente: DadosCliente) {
  const { data, error } = await supabase
    .from('clientes')
    .update(paraRegistro(cliente))
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error

  return paraCliente(data as ClienteRow)
}
