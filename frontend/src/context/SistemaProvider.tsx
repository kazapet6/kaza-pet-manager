import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  const ativo = useRef(false)
  const cargaAtual = useRef(0)

  const recarregarDados = useCallback(async () => {
    if (!ativo.current) throw new Error('A sessão operacional foi encerrada.')
    const carga = ++cargaAtual.current
    setCarregando(true)
    setErro(null)

    try {
      const [clientesCarregados, petsCarregados, racasCarregadas] = await Promise.all([
        listarClientes(),
        listarPets(),
        listarRacas(),
      ])

      if (ativo.current && carga === cargaAtual.current) {
        setClientes(clientesCarregados)
        setPets(petsCarregados)
        setRacas(racasCarregadas)
      }
    } catch (error) {
      if (ativo.current && carga === cargaAtual.current) setErro(obterMensagemErro(error))
      throw error
    } finally {
      if (ativo.current && carga === cargaAtual.current) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    ativo.current = true
    // A montagem ocorre apenas depois da autenticação interna em App.
    void recarregarDados().catch(() => { /* Erro exposto no contexto. */ })

    return () => {
      ativo.current = false
      cargaAtual.current += 1
    }
  }, [recarregarDados])

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
      recarregarDados,
      adicionarCliente,
      atualizarCliente,
      adicionarPet,
      atualizarPet,
    }),
    [clientes, pets, racas, carregando, erro, recarregarDados],
  )

  return (
    <SistemaContext.Provider value={value}>
      {erro && <div role="alert">Não foi possível atualizar os dados operacionais: {erro}
        <button type="button" disabled={carregando} onClick={() => void recarregarDados().catch(() => {})}>Tentar novamente</button>
      </div>}
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
