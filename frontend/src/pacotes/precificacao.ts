import { calcularComparacaoPacoteCompartilhada } from '../../../supabase/functions/_shared/precificacao.ts'
import type { PetMotor,ResultadoPrecificacao } from '../motorDisponibilidade/tipos.ts'
import type { Pacote,SimulacaoPacote } from './contrato.ts'

export function calcularComparacaoPacote(pacote:Pacote,pet:PetMotor,avulso:ResultadoPrecificacao):SimulacaoPacote{
  return calcularComparacaoPacoteCompartilhada(pacote,pet,avulso)
}
