import { createContext } from 'react'
import type { Cliente } from '../types/Cliente'
import type { Pet, Raca } from '../types/Pet'
import type { DadosPet } from '../data/pets'

type SistemaContextType = {
  clientes: Cliente[]
  pets: Pet[]
  racas: Raca[]
  carregando: boolean
  erro: string | null
  recarregarDados: () => Promise<void>

  adicionarCliente: (
    cliente: Omit<Cliente, 'id' | 'criadoEm'>
  ) => Promise<void>

  atualizarCliente: (
    id: string,
    cliente: Omit<Cliente, 'id' | 'criadoEm'>,
  ) => Promise<void>

  adicionarPet: (
    pet: DadosPet
  ) => Promise<void>

  atualizarPet: (
    id: string,
    pet: DadosPet,
  ) => Promise<void>
}

export const SistemaContext =
  createContext<SistemaContextType>(
    {} as SistemaContextType,
  )
