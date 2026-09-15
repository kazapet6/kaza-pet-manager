import type { Pet } from '../types/Pet.ts'

export type DadosPet = Omit<Pet, 'id' | 'criadoEm' | 'racaNome'>
export type PetRow = {
  id:string;cliente_id:string;nome:string;especie:Pet['especie'];raca_id:string|null
  raca:{id:string;nome:string}|{id:string;nome:string}[]|null;sexo:Pet['sexo'];porte:Pet['porte'];pelagem:Pet['pelagem']
  peso:number|null;cor:string;data_nascimento:string;castrado:boolean|null;temperamento:Pet['temperamento'];observacoes:string;created_at:string
}

export function paraPet(row:PetRow):Pet{return{id:row.id,clienteId:row.cliente_id,nome:row.nome,especie:row.especie,racaId:row.raca_id,racaNome:Array.isArray(row.raca)?row.raca[0]?.nome??null:row.raca?.nome??null,sexo:row.sexo,porte:row.porte,pelagem:row.pelagem,peso:row.peso,cor:row.cor,dataNascimento:row.data_nascimento,castrado:row.castrado,temperamento:row.temperamento,observacoes:row.observacoes,criadoEm:row.created_at}}
export function paraRegistro(pet:DadosPet){return{cliente_id:pet.clienteId,nome:pet.nome,especie:pet.especie,raca_id:pet.racaId,sexo:pet.sexo,porte:pet.porte,pelagem:pet.pelagem,peso:pet.peso,cor:pet.cor,data_nascimento:pet.dataNascimento,castrado:pet.castrado,temperamento:pet.temperamento,observacoes:pet.observacoes}}
