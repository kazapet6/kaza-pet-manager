import { calcularPrecificacaoCompartilhada } from '../precificacao.ts'
import type { DadosPrecificacao,PetMotor,ResultadoPrecificacao,ServicoResolvido } from './tipos.ts'

export function calcularPrecificacao(pet:PetMotor,servicosResolvidos:ServicoResolvido[],dados:DadosPrecificacao):ResultadoPrecificacao{
  return calcularPrecificacaoCompartilhada(pet,servicosResolvidos,dados)
}
