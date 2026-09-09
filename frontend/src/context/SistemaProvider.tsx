import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { SistemaContext } from './SistemaContext'
import type { Cliente } from '../types/Cliente'
import type { Pet, Raca } from '../types/Pet'
import {
  editarCliente,
  inserirCliente,
  listarClientes,
} from '../data/clientes'
import { editarPet, inserirPet, listarPets, type DadosPet } from '../data/pets'
import { listarRacas } from '../data/racas'

type Props = {
  children: ReactNode
}

export function SistemaProvider({ children }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pets, setPets] = useState<Pet[]>([])
  const [racas, setRacas] = useState<Raca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true

    async function carregarDados() {
      setCarregando(true)
      setErro(null)

      try {
        const [clientesCarregados, petsCarregados, racasCarregadas] = await Promise.all([
          listarClientes(),
          listarPets(),
          listarRacas(),
        ])

        if (ativo) {
          setClientes(clientesCarregados)
          setPets(petsCarregados)
          setRacas(racasCarregadas)
        }
      } catch (error) {
        if (ativo) setErro(obterMensagemErro(error))
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    void carregarDados()

    return () => {
      ativo = false
    }
  }, [])

  async function adicionarCliente(
    cliente: Omit<Cliente, 'id' | 'criadoEm'>
  ) {
    setErro(null)

    try {
      const novoCliente = await inserirCliente(cliente)
      setClientes((lista) => [...lista, novoCliente])
    } catch (error) {
      setErro(obterMensagemErro(error))
      throw error
    }
  }

  async function atualizarCliente(
    id: string,
    cliente: Omit<Cliente, 'id' | 'criadoEm'>,
  ) {
    setErro(null)

    try {
      const clienteAtualizado = await editarCliente(id, cliente)
      setClientes((lista) =>
        lista.map((clienteAtual) =>
          clienteAtual.id === id ? clienteAtualizado : clienteAtual,
        ),
      )
    } catch (error) {
      setErro(obterMensagemErro(error))
      throw error
    }
  }

  async function adicionarPet(
    pet: DadosPet
  ) {
    setErro(null)

    try {
      const novoPet = await inserirPet(pet)
      setPets((lista) => [...lista, novoPet])
    } catch (error) {
      setErro(obterMensagemErro(error))
      throw error
    }
  }

  async function atualizarPet(
    id: string,
    pet: DadosPet,
  ) {
    setErro(null)

    try {
      const petAtualizado = await editarPet(id, pet)
      setPets((lista) =>
        lista.map((petAtual) =>
          petAtual.id === id ? petAtualizado : petAtual,
        ),
      )
    } catch (error) {
      setErro(obterMensagemErro(error))
      throw error
    }
  }

  const value = useMemo(
    () => ({
      clientes,
      pets,
      racas,
      carregando,
      erro,
      adicionarCliente,
      atualizarCliente,
      adicionarPet,
      atualizarPet,
    }),
    [clientes, pets, racas, carregando, erro],
  )

  return (
    <SistemaContext.Provider value={value}>
      {children}
    </SistemaContext.Provider>
  )
}

function obterMensagemErro(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'Não foi possível concluir a operação no Supabase.'
}
