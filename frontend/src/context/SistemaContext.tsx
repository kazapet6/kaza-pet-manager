import { createContext } from 'react'
import type { Cliente } from '../types/Cliente'
import type { Pet } from '../types/Pet'

type SistemaContextType = {
  clientes: Cliente[]
  pets: Pet[]

  adicionarCliente: (
    cliente: Omit<Cliente, 'id' | 'criadoEm'>
  ) => void

  adicionarPet: (
    pet: Omit<Pet, 'id' | 'criadoEm'>
  ) => void
}

export const SistemaContext =
  createContext<SistemaContextType>(
    {} as SistemaContextType,
  )