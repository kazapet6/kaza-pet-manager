import { calcularPrecificacaoCompartilhada } from '../precificacao.ts'
import type { DadosPrecificacao,PetMotor,ResultadoPrecificacao,ServicoResolvido } from './tipos.ts'
import { camposNecessariosPrecificacao, ErroCadastroPetIncompleto } from './cadastroPet.ts'

export function calcularPrecificacao(pet:PetMotor,servicosResolvidos:ServicoResolvido[],dados:DadosPrecificacao):ResultadoPrecificacao{
  const campos=camposNecessariosPrecificacao(pet,servicosResolvidos,dados)
  if(campos.length)throw new ErroCadastroPetIncompleto(campos)
  return calcularPrecificacaoCompartilhada(pet,servicosResolvidos,dados)
}
