import type { Cliente } from '../types/Cliente.ts'
import type { Pet } from '../types/Pet.ts'
import type { EntradaDisponibilidade, ResultadoDisponibilidade } from '../motorDisponibilidade/tipos.ts'

export type ParametrosNovoAgendamento = {
  petId: string
  servicoIds: string[]
  data: string
  modalidade: 'sem_transporte' | 'taxidog'
  cicloTaxidogId: string
  funcionarioResponsavelId: string
}

export function buscarClientes(clientes: Cliente[], termo: string, limite = 8) {
  const busca = normalizar(termo)
  if (!busca) return []
  return clientes.filter((cliente) => normalizar(`${cliente.nome} ${cliente.whatsapp}`).includes(busca)).slice(0, limite)
}

export function petsDoCliente(pets: Pet[], clienteId: string) {
  return pets.filter((pet) => pet.clienteId === clienteId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id))
}

export function construirEntradaNovoAgendamento(parametros: ParametrosNovoAgendamento): EntradaDisponibilidade {
  return {
    petId: parametros.petId,
    servicoIds: [...parametros.servicoIds].sort(),
    data: parametros.data,
    preferenciaFuncionario: 'obrigatorio',
    funcionarioPreferidoId: parametros.funcionarioResponsavelId,
    tipoPlanejamento: 'normal',
    modalidade: parametros.modalidade,
    cicloTaxidogId: parametros.modalidade === 'taxidog' ? parametros.cicloTaxidogId : null,
  }
}

export function horariosDoResultado(resultado: ResultadoDisponibilidade | null) {
  return resultado?.estado === 'OK' ? resultado.opcoes.map((opcao) => opcao.horarioApresentado) : []
}

export function criarControleConsultas() {
  let versao = 0
  return {
    iniciar() { versao += 1; return versao },
    invalidar() { versao += 1 },
    atual(token: number) { return token === versao },
  }
}

export function pendenciasPet(pet: Pet | undefined) {
  if (!pet) return ['pet']
  return ([['nome', pet.nome], ['espécie', pet.especie], ['raça', pet.racaId], ['sexo', pet.sexo], ['porte', pet.porte], ['pelagem', pet.pelagem], ['temperamento', pet.temperamento]] as const)
    .filter(([, valor]) => !valor).map(([nome]) => nome)
}

export type DiaCalendario = { data: string; dia: number; mesAtual: boolean }

export function diasDoCalendario(ano: number, mes: number): DiaCalendario[] {
  const primeiro = new Date(Date.UTC(ano, mes, 1))
  const inicio = new Date(Date.UTC(ano, mes, 1 - primeiro.getUTCDay()))
  return Array.from({ length: 42 }, (_, indice) => {
    const dia = new Date(inicio); dia.setUTCDate(inicio.getUTCDate() + indice)
    return { data: dia.toISOString().slice(0, 10), dia: dia.getUTCDate(), mesAtual: dia.getUTCMonth() === mes }
  })
}

export function deslocarMes(ano: number, mes: number, deslocamento: number) {
  const data = new Date(Date.UTC(ano, mes + deslocamento, 1))
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() }
}

function normalizar(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}
