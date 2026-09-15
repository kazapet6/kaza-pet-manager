import type { CampoCadastroPet, DadosDisponibilidade, DadosPrecificacao, PetMotor, ServicoResolvido } from './tipos.ts'

export const CODIGO_CADASTRO_PET_INCOMPLETO='CADASTRO_PET_INCOMPLETO' as const

export class ErroCadastroPetIncompleto extends Error {
  readonly codigo=CODIGO_CADASTRO_PET_INCOMPLETO
  readonly campos:CampoCadastroPet[]
  constructor(campos:CampoCadastroPet[]) {
    super(`Complete o cadastro do pet: ${campos.join(', ')}.`)
    this.campos=campos
    this.name='ErroCadastroPetIncompleto'
  }
}

export function camposNecessariosDisponibilidade(pet:PetMotor,servicos:ServicoResolvido[],dados:DadosDisponibilidade):CampoCadastroPet[]{
  const ids=new Set(servicos.map((s)=>s.id))
  const necessarios=new Set<CampoCadastroPet>()
  if(dados.elegibilidade.especies.some((x)=>x.ativo&&ids.has(x.servicoId)))necessarios.add('especie')
  if(dados.elegibilidade.portes.some((x)=>x.ativo&&ids.has(x.servicoId)))necessarios.add('porte')
  if(dados.elegibilidade.racasBloqueadas.some((x)=>x.ativo&&ids.has(x.servicoId)))necessarios.add('raca')
  for(const regra of dados.modificadoresDuracao.filter((x)=>x.ativo&&ids.has(x.servicoId)))necessarios.add(regra.criterio)
  const etapas=new Set(dados.etapas.filter((x)=>x.ativo&&ids.has(x.servicoId)).map((x)=>x.id))
  if(dados.recursosEtapas.some((x)=>x.ativo&&x.tipo==='equipamento'&&etapas.has(x.servicoEtapaId))){necessarios.add('porte');necessarios.add('sexo')}
  return ausentes(pet,necessarios)
}

export function camposNecessariosPrecificacao(pet:PetMotor,servicos:ServicoResolvido[],dados:DadosPrecificacao):CampoCadastroPet[]{
  const ids=new Set(servicos.map((s)=>s.id)),necessarios=new Set<CampoCadastroPet>()
  for(const regra of dados.regrasPreco.filter((x)=>x.ativo&&ids.has(x.servicoId)))necessarios.add(regra.criterio)
  return ausentes(pet,necessarios)
}

function ausentes(pet:PetMotor,necessarios:Set<CampoCadastroPet>){
  const faltam=[...necessarios].filter((campo)=>campo==='raca'?!pet.racaId:pet[campo]===null)
  return faltam.sort()
}
