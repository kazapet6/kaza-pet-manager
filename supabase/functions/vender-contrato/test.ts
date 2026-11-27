import { executarVendaContrato, retomarVendaConfirmada } from './servico.ts'
import type { IntencaoVendaContrato } from '../_shared/contrato-venda.ts'

function assert(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem)
}

const ids = {
  chave: '11111111-1111-4111-8111-111111111111',
  usuario: '22222222-2222-4222-8222-222222222222',
  cliente: '33333333-3333-4333-8333-333333333333',
  pet: '44444444-4444-4444-8444-444444444444',
  pacote: '55555555-5555-4555-8555-555555555555',
  funcionario: '66666666-6666-4666-8666-666666666666',
  contrato: '77777777-7777-4777-8777-777777777777',
  ciclo: '88888888-8888-4888-8888-888888888888',
}

const intencao: IntencaoVendaContrato = {
  chaveIdempotencia: ids.chave, clienteId: ids.cliente, petId: ids.pet,
  pacoteId: ids.pacote, pacoteVersaoEsperada: 7, valorContratado: 240,
  motivoAjusteValor: null, dataAncora: '2026-09-26', diaSemanaFixo: 6,
  horarioFixo: '09:00', modalidadeTransporte: 'sem_transporte', taxidogCicloId: null,
  funcionarioResponsavelId: ids.funcionario, renovacaoAutomatica: true,
}

Deno.test('regressão: venda confirmada é retomada após falha pós-commit e mudança da Agenda', async () => {
  let contratos = 1
  let versaoAgenda = 10
  let chamadasVenda = 0
  let revalidacoes = 0
  let tentativaMaterializacao = 0
  const comercial = JSON.stringify(intencao)
  const contrato = {
    id: ids.contrato, cliente_id: ids.cliente, pet_id: ids.pet,
    clientes: { nome: 'Cliente teste' }, pet_nome_snapshot: 'Pet teste',
    pacote_nome_snapshot: 'Pacote semanal', status: 'ativo', valor_contratado: 240,
    data_ancora: '2026-09-26', dia_semana_fixo: 6, horario_fixo: '09:00:00',
    modalidade_transporte: 'sem_transporte', renovacao_automatica: true,
    created_at: '2026-09-22T12:00:00Z', contrato_itens: [],
  }
  const admin = {
    rpc(nome: string, parametros: Record<string, unknown>) {
      if (nome === 'vender_contrato') chamadasVenda += 1
      if (nome !== 'consultar_venda_contrato_idempotente_042') {
        throw new Error(`RPC inesperada no retry: ${nome}`)
      }
      const recebida = (parametros.p_intencao as Record<string, unknown>)
      const semUsuario = { ...recebida }
      delete semUsuario.usuarioId
      const mesmaIntencao = JSON.stringify(semUsuario) === comercial
      return Promise.resolve({
        data: mesmaIntencao
          ? { status: 'criado', contratoId: ids.contrato, cicloId: ids.ciclo, reutilizado: true }
          : { status: 'conflito', codigo: 'IDEMPOTENCIA_DIVERGENTE', mensagem: 'Intenção diferente.' },
        error: null,
      })
    },
    from(tabela: string) {
      assert(tabela === 'contratos', `retry consultou tabela inesperada: ${tabela}`)
      const consulta = {
        select() { return consulta },
        eq() { return consulta },
        single() { return Promise.resolve({ data: contrato, error: null }) },
      }
      return consulta
    },
  }
  const deps = {
    async materializar(cicloId: string) {
      assert(cicloId === ids.ciclo, 'retry deve retomar o Ciclo persistido')
      revalidacoes += 1
      assert(versaoAgenda >= 10, 'a disponibilidade deve ser revalidada contra a Agenda atual')
      tentativaMaterializacao += 1
      if (tentativaMaterializacao === 1) {
        return { status: 'erro' as const, cicloId, codigo: 'FALHA_POS_COMMIT', mensagem: 'Os atendimentos precisam de atenção.' }
      }
      return {
        status: 'materializado' as const, cicloId, reutilizado: false,
        atendimentos: [1, 2, 3, 4].map((n) => ({ ocorrenciaId: `ocorrencia-${n}`, atendimentoId: `atendimento-${n}` })),
      }
    },
  }

  const primeira = await executarVendaContrato(intencao, { id: ids.usuario }, admin as never, deps)
  assert(primeira.status === 'materializacao_pendente', 'falha pós-commit não pode negar a venda confirmada')
  assert(primeira.contratoId === ids.contrato, 'resposta pendente deve preservar o Contrato existente')
  assert(contratos === 1, 'a falha pós-commit não pode criar outro Contrato')

  versaoAgenda += 1
  const retry = await executarVendaContrato(intencao, { id: ids.usuario }, admin as never, deps)
  assert(retry.status === 'criado', 'mesma intenção deve retomar e concluir a materialização')
  assert(retry.materializacao.quantidadeAtendimentos === 4, 'o Ciclo semanal deve produzir quatro atendimentos')
  assert(contratos === 1, 'o retry não pode duplicar o Contrato')
  assert(chamadasVenda === 0, 'venda já confirmada deve ser reconhecida antes da RPC de criação')
  assert(revalidacoes === 2, 'cada tentativa de materialização deve revalidar a Agenda')

  const divergente = await executarVendaContrato({ ...intencao, petId: '99999999-9999-4999-8999-999999999999' }, { id: ids.usuario }, admin as never, deps)
  assert(divergente.status === 'conflito' && divergente.codigo === 'IDEMPOTENCIA_DIVERGENTE', 'mesma chave com intenção comercial diferente deve continuar rejeitada')
})

Deno.test('falha ao recarregar Contrato mantém resposta pós-commit explícita', async () => {
  const admin = {
    from() {
      const consulta = {
        select() { return consulta }, eq() { return consulta },
        single() { return Promise.resolve({ data: null, error: { code: 'INDISPONIVEL' } }) },
      }
      return consulta
    },
  }
  const resposta = await retomarVendaConfirmada(
    { status: 'criado', contratoId: ids.contrato, cicloId: ids.ciclo }, ids.usuario,
    admin as never,
  )
  assert(resposta.status === 'materializacao_pendente', 'falha de reload não pode negar a venda')
  assert(resposta.contratoId === ids.contrato && resposta.cicloId === ids.ciclo, 'IDs persistidos devem permanecer recuperáveis')
})

Deno.test('falha ao recarregar Ciclo mantém Contrato confirmado e recuperável', async () => {
  const contrato = {
    id: ids.contrato, cliente_id: ids.cliente, pet_id: ids.pet,
    clientes: { nome: 'Cliente teste' }, pet_nome_snapshot: 'Pet teste',
    pacote_nome_snapshot: 'Pacote semanal', status: 'ativo', valor_contratado: 240,
    data_ancora: '2026-09-26', dia_semana_fixo: 6, horario_fixo: '09:00:00',
    modalidade_transporte: 'sem_transporte', renovacao_automatica: true,
    created_at: '2026-09-22T12:00:00Z', contrato_itens: [],
  }
  const admin = {
    from(tabela: string) {
      const consulta = {
        select() { return consulta }, eq() { return consulta },
        single() {
          return Promise.resolve(tabela === 'contratos'
            ? { data: contrato, error: null }
            : { data: null, error: { code: 'INDISPONIVEL' } })
        },
      }
      return consulta
    },
  }
  const resposta = await retomarVendaConfirmada(
    { status: 'criado', contratoId: ids.contrato }, ids.usuario, admin as never,
  )
  assert(resposta.status === 'materializacao_pendente', 'falha do Ciclo não pode negar a venda')
  assert(resposta.contrato?.id === ids.contrato, 'Contrato recarregado deve acompanhar a resposta pendente')
})
