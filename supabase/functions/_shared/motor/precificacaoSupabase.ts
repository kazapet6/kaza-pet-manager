import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import type { DadosPrecificacao, PetMotor } from './tipos.ts'

type Linha = Record<string, unknown>

export async function carregarDadosPrecificacaoComCliente(
  petId: string,
  cliente: SupabaseClient,
): Promise<{ pet: PetMotor; dados: DadosPrecificacao }> {
  const [petResposta, servicosResposta, regrasResposta] = await Promise.all([
    cliente.from('pets').select('id, cliente_id, nome, especie, raca_id, sexo, porte, pelagem, peso, temperamento, raca:racas!pets_raca_especie_fkey(nome)').eq('id', petId).single(),
    cliente.from('servicos').select('id, nome, preco_base, ativo'),
    cliente.from('servico_regras_preco').select('id, servico_id, criterio, porte, pelagem, raca_id, peso_min, peso_max, temperamento, acrescimo_valor, ativo'),
  ])
  if (petResposta.error) throw petResposta.error
  if (servicosResposta.error) throw servicosResposta.error
  if (regrasResposta.error) throw regrasResposta.error

  const pet = petResposta.data as unknown as Linha
  const raca = Array.isArray(pet.raca) ? pet.raca[0] as Linha | undefined : pet.raca as Linha | undefined
  return {
    pet: {
      id: texto(pet.id),
      clienteId: texto(pet.cliente_id),
      nome: texto(pet.nome),
      especie: nuloOuTexto(pet.especie) as PetMotor['especie'],
      racaId: nuloOuTexto(pet.raca_id),
      racaNome: nuloOuTexto(raca?.nome),
      sexo: nuloOuTexto(pet.sexo) as PetMotor['sexo'],
      porte: nuloOuTexto(pet.porte) as PetMotor['porte'],
      pelagem: nuloOuTexto(pet.pelagem) as PetMotor['pelagem'],
      peso: nuloOuNumero(pet.peso),
      temperamento: nuloOuTexto(pet.temperamento) as PetMotor['temperamento'],
    },
    dados: {
      servicos: ((servicosResposta.data ?? []) as unknown as Linha[]).map((item) => ({
        id: texto(item.id), nome: texto(item.nome), precoBase: numero(item.preco_base), ativo: Boolean(item.ativo),
      })),
      regrasPreco: ((regrasResposta.data ?? []) as unknown as Linha[]).map((item) => ({
        id: texto(item.id),
        servicoId: texto(item.servico_id),
        criterio: texto(item.criterio) as DadosPrecificacao['regrasPreco'][number]['criterio'],
        porte: nuloOuTexto(item.porte) as DadosPrecificacao['regrasPreco'][number]['porte'],
        pelagem: nuloOuTexto(item.pelagem) as DadosPrecificacao['regrasPreco'][number]['pelagem'],
        racaId: nuloOuTexto(item.raca_id),
        pesoMin: nuloOuNumero(item.peso_min),
        pesoMax: nuloOuNumero(item.peso_max),
        temperamento: nuloOuTexto(item.temperamento) as DadosPrecificacao['regrasPreco'][number]['temperamento'],
        acrescimoValor: numero(item.acrescimo_valor),
        ativo: Boolean(item.ativo),
      })),
    },
  }
}

function texto(valor: unknown) { return valor === null || valor === undefined ? '' : String(valor) }
function nuloOuTexto(valor: unknown) { return valor === null || valor === undefined ? null : String(valor) }
function numero(valor: unknown) { const convertido = Number(valor); return Number.isFinite(convertido) ? convertido : 0 }
function nuloOuNumero(valor: unknown) { return valor === null || valor === undefined ? null : numero(valor) }
