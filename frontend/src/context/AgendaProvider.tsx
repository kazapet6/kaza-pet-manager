import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { carregarEstruturaAgenda } from '../data/agenda'
import type { EstruturaAgenda } from '../types/Agenda'
import { AgendaContext } from './AgendaContext'

const estruturaVazia: EstruturaAgenda = {
  servicos: [],
  servicoEtapas: [],
  servicoEtapaRecursos: [],
  servicoModificadores: [],
  servicoRegrasPreco: [],
  servicoEspecies: [],
  servicoPortes: [],
  servicoRacasBloqueadas: [],
  servicoDependencias: [],
  servicoAcoplamentos: [],
  funcionarios: [],
  funcionarioJornadas: [],
  funcionarioIntervalos: [],
  funcionarioServicos: [],
  funcionarioEtapas: [],
  equipamentos: [],
  equipamentoPerfis: [],
  equipamentoPerfilItens: [],
  equipamentoUnidades: [],
  janelasTransporte: [],
  taxidogCiclos: [],
  taxidogCicloDias: [],
  atendimentos: [],
  atendimentoEtapas: [],
}

type Props = {
  children: ReactNode
}

export function AgendaProvider({ children }: Props) {
  const [estrutura, setEstrutura] = useState(estruturaVazia)
  const [carregandoAgenda, setCarregandoAgenda] = useState(true)
  const [erroAgenda, setErroAgenda] = useState<string | null>(null)

  const recarregarAgenda = useCallback(async () => {
    setCarregandoAgenda(true)
    setErroAgenda(null)

    try {
      setEstrutura(await carregarEstruturaAgenda())
    } catch (error) {
      setErroAgenda(obterMensagemErro(error))
    } finally {
      setCarregandoAgenda(false)
    }
  }, [])

  useEffect(() => {
    void recarregarAgenda()
  }, [recarregarAgenda])

  const value = useMemo(
    () => ({
      ...estrutura,
      carregandoAgenda,
      erroAgenda,
      recarregarAgenda,
    }),
    [estrutura, carregandoAgenda, erroAgenda, recarregarAgenda],
  )

  return (
    <AgendaContext.Provider value={value}>
      {children}
    </AgendaContext.Provider>
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

  return 'Não foi possível carregar a estrutura da Agenda.'
}
