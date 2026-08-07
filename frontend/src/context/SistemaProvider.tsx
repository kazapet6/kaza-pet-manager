import { useMemo, useState, type ReactNode } from 'react'
import { SistemaContext } from './SistemaContext'
import type { Cliente } from '../types/Cliente'
import type { Pet } from '../types/Pet'

type Props = {
  children: ReactNode
}

export function SistemaProvider({ children }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pets, setPets] = useState<Pet[]>([])

  function gerarIdCliente() {
    const maior = clientes.reduce((valor, cliente) => {
      const numero = Number(cliente.id.replace('CLI-', ''))
      return numero > valor ? numero : valor
    }, 0)

    return `CLI-${String(maior + 1).padStart(6, '0')}`
  }

  function gerarIdPet() {
    const maior = pets.reduce((valor, pet) => {
      const numero = Number(pet.id.replace('PET-', ''))
      return numero > valor ? numero : valor
    }, 0)

    return `PET-${String(maior + 1).padStart(6, '0')}`
  }

  function adicionarCliente(
    cliente: Omit<Cliente, 'id' | 'criadoEm'>
  ) {
    const novoCliente: Cliente = {
      ...cliente,
      id: gerarIdCliente(),
      criadoEm: new Date().toISOString(),
    }

    setClientes((lista) => [...lista, novoCliente])
  }

  function adicionarPet(
    pet: Omit<Pet, 'id' | 'criadoEm'>
  ) {
    const novoPet: Pet = {
      ...pet,
      id: gerarIdPet(),
      criadoEm: new Date().toISOString(),
    }

    setPets((lista) => [...lista, novoPet])
  }

  const value = useMemo(
    () => ({
      clientes,
      pets,
      adicionarCliente,
      adicionarPet,
    }),
    [clientes, pets],
  )

  return (
    <SistemaContext.Provider value={value}>
      {children}
    </SistemaContext.Provider>
  )
}