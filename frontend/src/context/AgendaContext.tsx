import { createContext } from 'react'
import type { EstruturaAgenda } from '../types/Agenda'

export type AgendaContextType = EstruturaAgenda & {
  carregandoAgenda: boolean
  erroAgenda: string | null
  recarregarAgenda: () => Promise<void>
}

export const AgendaContext = createContext<AgendaContextType>(
  {} as AgendaContextType,
)
