import { useMemo, useState } from 'react'
import type { Cliente } from '../types/Cliente'

export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [pesquisa, setPesquisa] = useState('')

  const clientesFiltrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase()

    if (!termo) return clientes

    return clientes.filter((cliente) => {
      return (
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.whatsapp.toLowerCase().includes(termo) ||
        cliente.id.toLowerCase().includes(termo)
      )
    })
  }, [clientes, pesquisa])

  function gerarId() {
    const maior = clientes.reduce((valor, cliente) => {
      const numero = Number(cliente.id.replace('CLI-', ''))
      return numero > valor ? numero : valor
    }, 0)

    return `CLI-${String(maior + 1).padStart(6, '0')}`
  }

  function adicionarCliente(
    cliente: Omit<Cliente, 'id' | 'criadoEm'>
  ) {
    const novoCliente: Cliente = {
      ...cliente,
      id: gerarId(),
      criadoEm: new Date().toISOString(),
    }

    setClientes((lista) => [...lista, novoCliente])
  }

  return {
    clientes,
    clientesFiltrados,
    pesquisa,
    setPesquisa,
    adicionarCliente,
  }
}