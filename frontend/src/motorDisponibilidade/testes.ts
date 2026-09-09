import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from './motor.ts'
import type { DadosDisponibilidade, EntradaDisponibilidade, ResultadoDisponibilidade } from './tipos.ts'
import { ciclosAtivosNaData } from '../lib/ciclosTaxidog.ts'
import { adicionarOcupacoesAoSnapshot, planejarLoteEmMemoria } from './lote.ts'
import { rotuloEtapaComAcoplamentos } from './explicabilidade.ts'
import { resolverServicos } from './regras.ts'
import { calcularPrecificacao } from './precificacao.ts'
import { resumirDisponibilidadeDoCiclo } from './ciclo.ts'
import { classificarUsuarioInterno } from '../auth/interna.ts'
import { configuracaoFrontendContemSegredoAdministrativo } from '../auth/seguranca.test-helper.ts'
import { gerarChaveIdempotencia, normalizarIntencaoParaHash, serializarIntencaoParaHash, validarIntencaoConfirmacao } from '../confirmacao/contrato.ts'
import type { CodigoDominioConfirmacao, ConfirmacaoAgendamentoIntent, ConfirmacaoAgendamentoResposta } from '../confirmacao/contrato.ts'

const DATA = '2026-08-11'
const entradaBase: EntradaDisponibilidade = { petId: 'pet', servicoIds: ['banho'], data: DATA, preferenciaFuncionario: 'automatico', tipoPlanejamento: 'normal' }

function fixture(): DadosDisponibilidade {
  return {
    configuracao: { granularidadeMinutos: 15, esperaNormalMinutos: 15 },
    pets: [{ id: 'pet', nome: 'Luke', especie: 'cao', racaId: 'srd', racaNome: 'SRD', sexo: 'macho', porte: 'pequeno', pelagem: 'curta', peso: 8, temperamento: 'calmo' }],
    servicos: [{ id: 'banho', nome: 'Banho', ativo: true }, { id: 'hidratacao', nome: 'Hidratação', ativo: true }],
    dependencias: [{ servicoId: 'hidratacao', dependenciaServicoId: 'banho', ativo: true }],
    acoplamentos: [],
    elegibilidade: { especies: [{ servicoId: 'banho', especie: 'cao', ativo: true }, { servicoId: 'hidratacao', especie: 'cao', ativo: true }], portes: [{ servicoId: 'banho', porte: 'pequeno', ativo: true }, { servicoId: 'hidratacao', porte: 'pequeno', ativo: true }], racasBloqueadas: [] },
    etapas: [
      { id: 'lavar', servicoId: 'banho', nome: 'Banho', ordem: 1, duracaoMinutos: 30, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null },
      { id: 'secar', servicoId: 'banho', nome: 'Secagem', ordem: 2, duracaoMinutos: 30, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null },
      { id: 'finalizar', servicoId: 'banho', nome: 'Finalização', ordem: 3, duracaoMinutos: 10, ativo: true, politicaEsperaAntes: 'sem_limite_operacional', esperaAntesMinutos: null },
      { id: 'hidratar', servicoId: 'hidratacao', nome: 'Hidratação', ordem: 1, duracaoMinutos: 5, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null },
    ],
    recursosEtapas: [
      { id: 'rf1', servicoEtapaId: 'lavar', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true },
      { id: 're1', servicoEtapaId: 'secar', tipo: 'equipamento', equipamentoId: 'maq', quantidade: 1, ativo: true },
      { id: 'rf2', servicoEtapaId: 'finalizar', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true },
      { id: 'rf3', servicoEtapaId: 'hidratar', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true },
    ],
    modificadoresDuracao: [], funcionamentoConfigurado: true,
    blocosEstabelecimento: [{ diaSemana: 2, inicio: 540, fim: 660, ativo: true }], excecoesEstabelecimento: [],
    funcionarios: [{ id: 'agata', nome: 'Agata', ativo: true }, { id: 'bruno', nome: 'Bruno', ativo: true }],
    jornadas: [{ funcionarioId: 'agata', diaSemana: 2, inicio: 540, fim: 660, ativo: true }, { funcionarioId: 'bruno', diaSemana: 2, inicio: 540, fim: 660, ativo: true }], intervalosFuncionarios: [],
    habilitacoes: { servicos: [{ funcionarioId: 'agata', servicoId: 'banho', ativo: true }, { funcionarioId: 'bruno', servicoId: 'banho', ativo: true }, { funcionarioId: 'agata', servicoId: 'hidratacao', ativo: true }, { funcionarioId: 'bruno', servicoId: 'hidratacao', ativo: true }], etapas: [] },
    equipamentos: [{ id: 'maq', nome: 'Máquina', ativo: true, separarPorSexo: false, exigeSupervisaoHumana: false }],
    unidadesEquipamentos: [{ id: 'u1', equipamentoId: 'maq', numero: 1, nome: 'Unidade 1', ativo: true }, { id: 'u2', equipamentoId: 'maq', numero: 2, nome: 'Unidade 2', ativo: true }],
    perfisCapacidade: [{ id: 'p2', equipamentoId: 'maq', ativo: true }], itensPerfisCapacidade: [{ perfilId: 'p2', porte: 'pequeno', quantidade: 2, ativo: true }],
    reservasFuncionarios: [], reservasEquipamentos: [], ciclosTaxidog: [],
  }
}

function simples(politica: 'padrao' | 'personalizada' | 'sem_limite_operacional' = 'padrao') {
  const dados = fixture()
  dados.etapas = [
    { id: 'inicio', servicoId: 'banho', nome: 'Início', ordem: 1, duracaoMinutos: 30, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null },
    { id: 'fim', servicoId: 'banho', nome: 'Fim', ordem: 2, duracaoMinutos: 10, ativo: true, politicaEsperaAntes: politica, esperaAntesMinutos: politica === 'personalizada' ? 15 : null },
  ]
  dados.recursosEtapas = [{ id: 'r', servicoEtapaId: 'fim', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true }]
  return dados
}

function executar(dados: DadosDisponibilidade, entrada: EntradaDisponibilidade = entradaBase) { return calcularDisponibilidade(entrada, dados) }
function horario(resultado: ResultadoDisponibilidade, minuto = 540) { return resultado.opcoes.find((item) => item.horarioApresentado === minuto) }
function exigir(condicao: unknown, mensagem: string) { if (!condicao) throw new Error(mensagem) }
function caso(letra: string, nome: string, teste: () => void) { teste(); console.log(`${letra}. OK — ${nome}`) }

caso('A', 'Loja fechada', () => { const d = fixture(); d.blocosEstabelecimento = []; d.funcionamentoConfigurado = true; exigir(executar(d).estado === 'LOJA_FECHADA', 'Deveria informar loja fechada.') })
caso('B', 'Agenda não configurada', () => { const d = fixture(); d.funcionamentoConfigurado = false; exigir(executar(d).estado === 'AGENDA_NAO_CONFIGURADA', 'Estado incorreto.') })
caso('C', 'Funcionário fora da jornada', () => { const d = fixture(); d.jornadas = []; exigir(executar(d).estado === 'SEM_DISPONIBILIDADE', 'Não deveria alocar funcionário.') })
caso('D', 'Intervalo do funcionário', () => { const d = fixture(); d.intervalosFuncionarios = d.funcionarios.map((f) => ({ funcionarioId: f.id, diaSemana: 2, inicio: 540, fim: 570, ativo: true })); exigir(!horario(executar(d)), '09:00 invade intervalo.') })
caso('E', 'Funcionário já ocupado', () => { const d = fixture(); d.reservasFuncionarios = d.funcionarios.map((f) => ({ id: f.id, funcionarioId: f.id, inicio: 540, fim: 660 })); exigir(executar(d).estado === 'SEM_DISPONIBILIDADE', 'Funcionários ocupados.') })
caso('F', 'Equipamento ocupado', () => { const d = fixture(); d.unidadesEquipamentos[1].ativo = false; d.reservasEquipamentos = [{ id: 'e1', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'macho' }, { id: 'e2', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'macho' }]; exigir(executar(d).estado === 'SEM_DISPONIBILIDADE', 'Capacidade ocupada.') })
caso('G', 'Capacidade compartilhada disponível', () => { const d = fixture(); d.unidadesEquipamentos[1].ativo = false; d.reservasEquipamentos = [{ id: 'e1', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'macho' }]; exigir(Boolean(horario(executar(d))), 'Deveria compartilhar a unidade.') })
caso('H', 'Capacidade compartilhada esgotada', () => { const d = fixture(); d.unidadesEquipamentos[1].ativo = false; d.reservasEquipamentos = [{ id: 'e1', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'macho' }, { id: 'e2', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'macho' }]; exigir(!horario(executar(d)), 'Unidade excedeu perfil.') })
caso('I', 'Separação por sexo', () => { const d = fixture(); d.equipamentos[0].separarPorSexo = true; d.unidadesEquipamentos[1].ativo = false; d.reservasEquipamentos = [{ id: 'e1', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'femea' }]; exigir(!horario(executar(d)), 'Não deveria misturar sexos.') })
caso('J', 'Serviço com dependência', () => { const r = executar(fixture(), { ...entradaBase, servicoIds: ['hidratacao'] }); exigir(r.opcoes[0].servicos.map((s) => s.id).join(',') === 'banho,hidratacao', 'Dependência não resolvida.') })
caso('K', 'Modificador por porte', () => { const d = fixture(); d.modificadoresDuracao.push({ id: 'porte+10', servicoId: 'banho', servicoEtapaId: 'lavar', criterio: 'porte', acrescimoMinutos: 10, ativo: true, racaId: null, porte: 'pequeno', pelagem: null, temperamento: null, pesoMin: null, pesoMax: null }); exigir(horario(executar(d))?.etapas[0].duracaoMinutos === 40, 'Modificador não aplicado.') })
caso('L', 'Modificador por pelagem', () => { const d = fixture(); d.modificadoresDuracao.push({ id: 'pelagem+5', servicoId: 'banho', servicoEtapaId: 'lavar', criterio: 'pelagem', acrescimoMinutos: 5, ativo: true, racaId: null, porte: null, pelagem: 'curta', temperamento: null, pesoMin: null, pesoMax: null }); exigir(horario(executar(d))?.etapas[0].duracaoMinutos === 35, 'Modificador não aplicado.') })
caso('M', 'Preferência automática', () => { exigir(horario(executar(fixture()))?.etapas[0].funcionarios[0].id === 'agata', 'Escolha automática instável.') })
caso('N', 'Preferencial com fallback', () => { const d = fixture(); d.reservasFuncionarios = [{ id: 'a', funcionarioId: 'agata', inicio: 540, fim: 660 }]; const r = executar(d, { ...entradaBase, preferenciaFuncionario: 'preferencial', funcionarioPreferidoId: 'agata' }); exigir(horario(r)?.etapas[0].funcionarios[0].id === 'bruno', 'Fallback não ocorreu.') })
caso('O', 'Obrigatório indisponível', () => { const d = fixture(); d.reservasFuncionarios = [{ id: 'a', funcionarioId: 'agata', inicio: 540, fim: 660 }]; exigir(executar(d, { ...entradaBase, preferenciaFuncionario: 'obrigatorio', funcionarioPreferidoId: 'agata' }).estado === 'SEM_DISPONIBILIDADE', 'Funcionário obrigatório foi substituído.') })
caso('P', 'Espera de até 15 minutos', () => { const d = simples(); d.reservasFuncionarios = d.funcionarios.map((f) => ({ id: f.id, funcionarioId: f.id, inicio: 570, fim: 580 })); exigir(horario(executar(d))?.tempoEspera === 10, 'Espera válida não aplicada.') })
caso('Q', 'Espera superior ao limite rejeitada', () => { const d = simples(); d.reservasFuncionarios = d.funcionarios.map((f) => ({ id: f.id, funcionarioId: f.id, inicio: 570, fim: 586 })); exigir(!horario(executar(d)), 'Espera superior a 15 foi aceita.') })
caso('R', 'Espera longa antes da finalização', () => { const d = simples('sem_limite_operacional'); d.reservasFuncionarios = d.funcionarios.map((f) => ({ id: f.id, funcionarioId: f.id, inicio: 570, fim: 586 })); exigir((horario(executar(d))?.tempoEspera ?? 0) === 16, 'Espera longa deveria ser aceita.') })
caso('S', 'Conclusão após funcionamento', () => { const d = fixture(); d.blocosEstabelecimento[0].fim = 600; exigir(executar(d).estado === 'SEM_DISPONIBILIDADE', 'Atendimento ultrapassou a loja.') })
caso('T', 'Invasão de intervalo/jornada', () => { const d = fixture(); d.intervalosFuncionarios = d.funcionarios.map((f) => ({ funcionarioId: f.id, diaSemana: 2, inicio: 560, fim: 620, ativo: true })); exigir(!horario(executar(d)), 'Etapa humana invadiu intervalo.') })
caso('U', 'Duas unidades do equipamento', () => { const d = fixture(); d.reservasEquipamentos = [{ id: 'e1', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'macho' }, { id: 'e2', unidadeId: 'u1', inicio: 540, fim: 660, porte: 'pequeno', sexo: 'macho' }]; exigir(horario(executar(d))?.etapas[1].equipamentos[0].unidadeId === 'u2', 'Não utilizou a segunda unidade.') })
caso('V', 'Funcionário e equipamento simultâneos', () => { const d = fixture(); d.recursosEtapas.push({ id: 'rf-secar', servicoEtapaId: 'secar', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true }); const etapa = horario(executar(d))?.etapas[1]; exigir(etapa?.funcionarios.length === 1 && etapa.equipamentos.length === 1, 'Recursos simultâneos ausentes.') })
caso('W', 'Granularidade de 15 minutos', () => { exigir(executar(fixture()).opcoes.every((item) => item.horarioApresentado % 15 === 0), 'Candidato fora da granularidade.') })
caso('X', 'Nenhuma disponibilidade', () => { const d = fixture(); d.funcionarios.forEach((item) => { item.ativo = false }); exigir(executar(d).estado === 'SEM_DISPONIBILIDADE', 'Estado final incorreto.') })

function somenteEquipamento(duracao: number) {
  const dados = fixture()
  dados.etapas = [{ id: 'secar', servicoId: 'banho', nome: 'Secagem', ordem: 1, duracaoMinutos: duracao, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }]
  dados.recursosEtapas = [{ id: 're1', servicoEtapaId: 'secar', tipo: 'equipamento', equipamentoId: 'maq', quantidade: 1, ativo: true }]
  dados.equipamentos[0].exigeSupervisaoHumana = true
  return dados
}

function ciclo(id = 'manha', coletaFim = 540, limite = 600) {
  return { id, nome: id, ordem: id === 'manha' ? 1 : 2, coletaInicio: coletaFim - 60, coletaFim, conclusaoLimite: limite, ativo: true, diasSemana: [2] }
}

function entradaTaxi(cicloTaxidogId = 'manha'): EntradaDisponibilidade {
  return { ...entradaBase, modalidade: 'taxidog', cicloTaxidogId }
}

caso('Y', 'Equipamento supervisionado dentro da jornada', () => { const d = somenteEquipamento(30); exigir(Boolean(horario(executar(d))), 'Uso supervisionado deveria ser aceito.') })
caso('Z', 'Equipamento supervisionado invade intervalo', () => { const d = somenteEquipamento(30); d.intervalosFuncionarios = d.funcionarios.map((f) => ({ funcionarioId: f.id, diaSemana: 2, inicio: 555, fim: 600, ativo: true })); exigir(!horario(executar(d)), 'Uso sem cobertura integral foi aceito.') })
caso('AA', 'Equipamento termina no início do intervalo', () => { const d = somenteEquipamento(30); d.intervalosFuncionarios = d.funcionarios.map((f) => ({ funcionarioId: f.id, diaSemana: 2, inicio: 570, fim: 600, ativo: true })); exigir(Boolean(horario(executar(d))), 'Fim contíguo ao intervalo deveria ser aceito.') })
caso('AB', 'Equipamento ultrapassa fim da jornada', () => { const d = somenteEquipamento(30); d.jornadas.forEach((j) => { j.fim = 560 }); exigir(!horario(executar(d)), 'Uso após jornada foi aceito.') })
caso('AC', 'Supervisão compartilhada com trabalho exclusivo', () => { const d = somenteEquipamento(30); d.reservasFuncionarios = d.funcionarios.map((f) => ({ id: f.id, funcionarioId: f.id, inicio: 540, fim: 570 })); exigir(Boolean(horario(executar(d))), 'Ocupação exclusiva bloqueou indevidamente a supervisão.') })
caso('AD', 'Múltiplos equipamentos com supervisão simultânea', () => { const d = somenteEquipamento(30); d.equipamentos.push({ id: 'maq2', nome: 'Máquina 2', ativo: true, separarPorSexo: false, exigeSupervisaoHumana: true }); d.unidadesEquipamentos.push({ id: 'u3', equipamentoId: 'maq2', numero: 1, nome: 'Unidade 1', ativo: true }); d.perfisCapacidade.push({ id: 'p3', equipamentoId: 'maq2', ativo: true }); d.itensPerfisCapacidade.push({ perfilId: 'p3', porte: 'pequeno', quantidade: 1, ativo: true }); d.recursosEtapas.push({ id: 're2', servicoEtapaId: 'secar', tipo: 'equipamento', equipamentoId: 'maq2', quantidade: 1, ativo: true }); const etapa = horario(executar(d))?.etapas[0]; exigir(etapa?.equipamentos.length === 2 && etapa.equipamentos.every((e) => e.supervisores.length > 0), 'Equipamentos simultâneos não foram supervisionados.') })
caso('AE', 'TaxiDog conclui antes do deadline', () => { const d = somenteEquipamento(30); d.ciclosTaxidog = [ciclo()]; exigir(horario(executar(d, entradaTaxi()), 540)?.conclusaoPrevista === 570, 'Ciclo válido foi rejeitado.') })
caso('AF', 'TaxiDog conclui exatamente no deadline', () => { const d = somenteEquipamento(60); d.ciclosTaxidog = [ciclo()]; exigir(horario(executar(d, entradaTaxi()), 540)?.conclusaoPrevista === 600, 'Conclusão no deadline foi rejeitada.') })
caso('AG', 'TaxiDog ultrapassa deadline em um minuto', () => { const d = somenteEquipamento(61); d.ciclosTaxidog = [ciclo()]; exigir(executar(d, entradaTaxi()).estado === 'SEM_DISPONIBILIDADE', 'Conclusão após deadline foi aceita.') })
caso('AH', 'TaxiDog não migra para ciclo posterior', () => { const d = somenteEquipamento(61); d.ciclosTaxidog = [ciclo(), ciclo('tarde', 660, 720)]; exigir(executar(d, entradaTaxi('manha')).estado === 'SEM_DISPONIBILIDADE', 'Pet migrou automaticamente de ciclo.') })
caso('AI', 'Sem transporte mantém comportamento atual', () => { const d = somenteEquipamento(30); d.blocosEstabelecimento[0].inicio = 480; d.jornadas.forEach((j) => { j.inicio = 480 }); d.ciclosTaxidog = [ciclo()]; exigir(Boolean(horario(executar(d, { ...entradaBase, modalidade: 'sem_transporte' }), 480)), 'Ciclo TaxiDog afetou modalidade sem transporte.') })
caso('AJ', 'Horários do ciclo são configuráveis', () => { const d = somenteEquipamento(60); d.ciclosTaxidog = [ciclo('manha', 570, 630)]; exigir(horario(executar(d, entradaTaxi()), 570)?.conclusaoPrevista === 630, 'Motor ignorou horários persistidos do ciclo.') })

caso('AK', 'Ciclo ativo aparece no dia configurado', () => { exigir(ciclosAtivosNaData([ciclo()], DATA).map((item) => item.id).includes('manha'), 'Ciclo ativo não apareceu no dia configurado.') })
caso('AL', 'Ciclo não aparece em dia não configurado', () => { const item = ciclo(); item.diasSemana = [3]; exigir(ciclosAtivosNaData([item], DATA).length === 0, 'Ciclo apareceu fora dos dias configurados.') })
caso('AM', 'Ciclo inativo não é utilizável', () => { const item = ciclo(); item.ativo = false; exigir(ciclosAtivosNaData([item], DATA).length === 0 && executar(Object.assign(somenteEquipamento(30), { ciclosTaxidog: [item] }), entradaTaxi()).estado === 'SEM_DISPONIBILIDADE', 'Ciclo inativo foi utilizado.') })
caso('FN1','Funcionário habilitado para Banho conta como capacidade',()=>{const d=fixture();d.habilitacoes.servicos=d.habilitacoes.servicos.filter(x=>x.funcionarioId==='agata'&&x.servicoId==='banho');exigir(Boolean(horario(executar(d))),'Funcionário habilitado não contou.')})
caso('FN2','Funcionário não habilitado para Serviço não conta',()=>{const d=fixture();d.habilitacoes.servicos=[];exigir(executar(d).estado==='SEM_DISPONIBILIDADE','Funcionário sem habilitação contou como capacidade.')})
caso('FN3','Dois funcionários com apenas um habilitado geram uma alocação elegível',()=>{const d=fixture();d.habilitacoes.servicos=d.habilitacoes.servicos.filter(x=>x.funcionarioId==='bruno');const o=horario(executar(d));exigir(Boolean(o)&&o!.etapas.filter(e=>e.funcionarios.length).every(e=>e.funcionarios.every(f=>f.id==='bruno')),'Motor alocou funcionário sem habilitação.')})
caso('AN', 'TaxiDog exige ciclo', () => { const d = somenteEquipamento(30); d.ciclosTaxidog = [ciclo()]; exigir(executar(d, { ...entradaBase, modalidade: 'taxidog', cicloTaxidogId: null }).estado === 'SERVICO_INVALIDO', 'Consulta TaxiDog sem ciclo foi aceita.') })
caso('AO', 'Ciclo inválido para o dia é rejeitado', () => { const d = somenteEquipamento(30); const item = ciclo(); item.diasSemana = [3]; d.ciclosTaxidog = [item]; exigir(executar(d, entradaTaxi()).estado === 'SEM_DISPONIBILIDADE', 'Ciclo inválido para o dia foi aceito.') })

function cenarioTrezeDez() {
  const d = fixture()
  d.blocosEstabelecimento[0] = { diaSemana: 2, inicio: 540, fim: 840, ativo: true }
  d.jornadas.forEach((jornada) => { jornada.fim = 840 })
  d.intervalosFuncionarios = d.funcionarios.map((funcionario) => ({ funcionarioId: funcionario.id, diaSemana: 2, inicio: 720, fim: 780, ativo: true }))
  d.equipamentos[0].exigeSupervisaoHumana = true
  d.ciclosTaxidog = [ciclo('manha', 540, 780), ciclo('tarde', 840, 900)]
  return d
}

caso('AT', '11:00–13:10 permanece possível sem transporte', () => { const opcao = horario(executar(cenarioTrezeDez()), 660); exigir(opcao?.conclusaoPrevista === 790 && opcao.tempoEspera === 60, 'Planejamento sem transporte 11:00–13:10 não foi preservado.') })
caso('AU', '11:00–13:10 é rejeitado no TaxiDog com deadline 13:00', () => { exigir(!horario(executar(cenarioTrezeDez(), entradaTaxi('manha')), 660), 'Planejamento após o deadline apareceu no ciclo da manhã.') })

function baseLote() {
  const d = fixture()
  d.pets.push({ ...d.pets[0], id: 'pet-b', nome: 'B' }, { ...d.pets[0], id: 'pet-c', nome: 'C' })
  d.blocosEstabelecimento = [{ diaSemana: 2, inicio: 540, fim: 600, ativo: true }]
  d.jornadas.forEach((item) => { item.inicio = 540; item.fim = 600 })
  d.intervalosFuncionarios = []
  d.reservasFuncionarios = []
  d.reservasEquipamentos = []
  return d
}

function solicitacao(id: string, petId: string, servicoId = 'banho', modalidade: 'sem_transporte' | 'taxidog' = 'sem_transporte') {
  return { id, entrada: { ...entradaBase, petId, servicoIds: [servicoId], modalidade, cicloTaxidogId: modalidade === 'taxidog' ? 'manha' : null } }
}

function etapaUnicaHumana(d = baseLote(), duracao = 30) {
  d.etapas = [{ id: 'humana', servicoId: 'banho', nome: 'Etapa humana', ordem: 1, duracaoMinutos: duracao, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }]
  d.recursosEtapas = [{ id: 'rh', servicoEtapaId: 'humana', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true }]
  return d
}

function naoSobrepoe(a: { inicio: number; fim: number }, b: { inicio: number; fim: number }) { return a.fim <= b.inicio || b.fim <= a.inicio }

caso('AW', 'Funcionário não executa etapas exclusivas simultâneas', () => { const d = etapaUnicaHumana(); d.funcionarios = [d.funcionarios[0]]; d.habilitacoes.servicos = d.habilitacoes.servicos.filter((item) => item.funcionarioId === 'agata'); const r = planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b')], d); const etapas = r.planejamentos.map((item) => item.opcao.etapas[0]); exigir(r.estado === 'SOLUCAO' && naoSobrepoe(etapas[0], etapas[1]), 'Funcionário foi alocado simultaneamente.') })
caso('AX', 'Supervisão e etapa exclusiva simultâneas', () => { const d = baseLote(); d.servicos.push({ id: 'humano', nome: 'Humano', ativo: true }); d.elegibilidade.especies.push({ servicoId: 'humano', especie: 'cao', ativo: true }); d.elegibilidade.portes.push({ servicoId: 'humano', porte: 'pequeno', ativo: true }); d.etapas = [{ id: 'maq-etapa', servicoId: 'banho', nome: 'Máquina', ordem: 1, duracaoMinutos: 30, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }, { id: 'humana', servicoId: 'humano', nome: 'Humana', ordem: 1, duracaoMinutos: 30, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }]; d.recursosEtapas = [{ id: 'rm', servicoEtapaId: 'maq-etapa', tipo: 'equipamento', equipamentoId: 'maq', quantidade: 1, ativo: true }, { id: 'rh', servicoEtapaId: 'humana', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true }]; d.equipamentos[0].exigeSupervisaoHumana = true; d.habilitacoes.servicos.push({ funcionarioId: 'agata', servicoId: 'humano', ativo: true }); const r = planejarLoteEmMemoria([solicitacao('maq', 'pet'), solicitacao('hum', 'pet-b', 'humano')], d); exigir(r.estado === 'SOLUCAO' && r.planejamentos.every((item) => item.opcao.inicioOperacional === 540), 'Supervisão bloqueou recurso exclusivo.') })
caso('AY', 'Duas unidades físicas em paralelo', () => { const d = somenteEquipamento(30); d.pets.push({ ...d.pets[0], id: 'pet-b', nome: 'B' }); d.blocosEstabelecimento[0].fim = 570; d.itensPerfisCapacidade[0].quantidade = 1; const r = planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b')], d); const unidades = r.planejamentos.map((item) => item.opcao.etapas[0].equipamentos[0].unidadeId); exigir(r.estado === 'SOLUCAO' && new Set(unidades).size === 2, 'Não distribuiu entre as duas unidades.') })
caso('AZ', 'Capacidade compartilhada válida em concorrência', () => { const d = somenteEquipamento(30); d.pets.push({ ...d.pets[0], id: 'pet-b', nome: 'B' }); d.unidadesEquipamentos[1].ativo = false; d.blocosEstabelecimento[0].fim = 570; const r = planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b')], d); exigir(r.estado === 'SOLUCAO' && r.planejamentos.every((item) => item.opcao.inicioOperacional === 540), 'Capacidade compartilhada válida foi rejeitada.') })
caso('BA', 'Capacidade compartilhada excedida', () => { const d = somenteEquipamento(30); d.pets.push({ ...d.pets[0], id: 'pet-b', nome: 'B' }, { ...d.pets[0], id: 'pet-c', nome: 'C' }); d.unidadesEquipamentos[1].ativo = false; d.blocosEstabelecimento[0].fim = 570; exigir(planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b'), solicitacao('c', 'pet-c')], d).estado === 'SEM_DISPONIBILIDADE', 'Capacidade excedida foi aceita.') })

function cenarioFinalizacoes() {
  const d = baseLote(); d.blocosEstabelecimento[0].fim = 570; d.funcionarios = [d.funcionarios[0]]; d.habilitacoes.servicos = d.habilitacoes.servicos.filter((item) => item.funcionarioId === 'agata')
  d.etapas = [{ id: 'livre', servicoId: 'banho', nome: 'Preparação', ordem: 1, duracaoMinutos: 10, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }, { id: 'final', servicoId: 'banho', nome: 'Finalização', ordem: 2, duracaoMinutos: 10, ativo: true, politicaEsperaAntes: 'personalizada', esperaAntesMinutos: 10 }]
  d.recursosEtapas = [{ id: 'rf', servicoEtapaId: 'final', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true }]
  return d
}

caso('BB', 'Finalizações concorrentes são serializadas', () => { const r = planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b')], cenarioFinalizacoes()); const finais = r.planejamentos.map((item) => item.opcao.etapas[1]); exigir(r.estado === 'SOLUCAO' && naoSobrepoe(finais[0], finais[1]) && r.planejamentos.some((item) => item.opcao.tempoEspera === 10), 'Finalizações não foram serializadas por espera.') })
caso('BC', 'Espera recalcula etapas seguintes', () => { const d = cenarioFinalizacoes(); d.blocosEstabelecimento[0].fim = 580; d.etapas.push({ id: 'depois', servicoId: 'banho', nome: 'Depois', ordem: 3, duracaoMinutos: 10, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }); const r = planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b')], d); const comEspera = r.planejamentos.find((item) => item.opcao.tempoEspera > 0)!; exigir(r.estado === 'SOLUCAO' && comEspera.opcao.etapas[2].inicio === comEspera.opcao.etapas[1].fim, 'Etapa posterior não acompanhou a espera.') })
caso('BD', 'Conjunto TaxiDog cabe no deadline', () => { const d = etapaUnicaHumana(baseLote(), 15); d.funcionarios = [d.funcionarios[0]]; d.ciclosTaxidog = [ciclo('manha', 540, 570)]; const r = planejarLoteEmMemoria([solicitacao('a', 'pet', 'banho', 'taxidog'), solicitacao('b', 'pet-b', 'banho', 'taxidog')], d); exigir(r.estado === 'SOLUCAO' && r.planejamentos.every((item) => item.opcao.conclusaoPrevista <= 570), 'Conjunto TaxiDog deveria caber.') })
caso('BE', 'Pet adicional excede o deadline', () => { const d = etapaUnicaHumana(baseLote(), 15); d.funcionarios = [d.funcionarios[0]]; d.ciclosTaxidog = [ciclo('manha', 540, 570)]; exigir(planejarLoteEmMemoria([solicitacao('a', 'pet', 'banho', 'taxidog'), solicitacao('b', 'pet-b', 'banho', 'taxidog'), solicitacao('c', 'pet-c', 'banho', 'taxidog')], d).estado === 'SEM_DISPONIBILIDADE', 'Pet adicional deveria exceder o ciclo.') })

function cenarioBacktracking() {
  const d = etapaUnicaHumana(baseLote(), 30); d.blocosEstabelecimento[0].fim = 570
  d.servicos.push({ id: 'restrito', nome: 'Restrito', ativo: true }); d.elegibilidade.especies.push({ servicoId: 'restrito', especie: 'cao', ativo: true }); d.elegibilidade.portes.push({ servicoId: 'restrito', porte: 'pequeno', ativo: true }); d.etapas.push({ id: 'restrita', servicoId: 'restrito', nome: 'Restrita', ordem: 1, duracaoMinutos: 30, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }); d.recursosEtapas.push({ id: 'rr', servicoEtapaId: 'restrita', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true }, { id: 'rre', servicoEtapaId: 'restrita', tipo: 'equipamento', equipamentoId: 'maq', quantidade: 1, ativo: true }); d.habilitacoes.servicos.push({ funcionarioId: 'agata', servicoId: 'restrito', ativo: true }); d.equipamentos[0].exigeSupervisaoHumana = false
  return d
}

caso('BF', 'Backtracking supera escolha gulosa', () => { const r = planejarLoteEmMemoria([solicitacao('a-flexivel', 'pet'), solicitacao('b-restrito', 'pet-b', 'restrito')], cenarioBacktracking(), { maximoPets: 5, maximoOpcoesPorPet: 2, maximoEstados: 100 }); exigir(r.estado === 'SOLUCAO' && r.houveBacktracking && r.planejamentos.find((item) => item.solicitacaoId === 'a-flexivel')?.opcao.etapas[0].funcionarios[0].id === 'bruno', `Backtracking não encontrou a alternativa; estados=${r.estadosExplorados}.`); console.log(`BF estados explorados: ${r.estadosExplorados}`) })
caso('BG', 'Ocupação simulada altera disponibilidade', () => { const d = etapaUnicaHumana(); d.funcionarios = [d.funcionarios[0]]; const ocupado = adicionarOcupacoesAoSnapshot(d, { funcionarios: [{ id: 'sim', funcionarioId: 'agata', inicio: 540, fim: 600 }] }); exigir(executar(ocupado).estado === 'SEM_DISPONIBILIDADE', 'Ocupação simulada não alterou disponibilidade.') })
caso('BH', 'Remover simulação restaura disponibilidade', () => { const d = etapaUnicaHumana(); d.funcionarios = [d.funcionarios[0]]; const ocupado = adicionarOcupacoesAoSnapshot(d, { funcionarios: [{ id: 'sim', funcionarioId: 'agata', inicio: 540, fim: 600 }] }); exigir(executar(ocupado).estado === 'SEM_DISPONIBILIDADE' && executar(d).estado === 'OK', 'Remoção da simulação não restaurou disponibilidade.') })
caso('BI', 'Limite retorna busca inconclusiva', () => { const d = etapaUnicaHumana(); const r = planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b')], d, { maximoPets: 5, maximoOpcoesPorPet: 10, maximoEstados: 1 }); exigir(r.estado === 'BUSCA_INCONCLUSIVA', 'Limite foi confundido com indisponibilidade.') })
caso('BJ', 'Solução após backtracking é informada', () => { const r = planejarLoteEmMemoria([solicitacao('a-flexivel', 'pet'), solicitacao('b-restrito', 'pet-b', 'restrito')], cenarioBacktracking(), { maximoPets: 5, maximoOpcoesPorPet: 2, maximoEstados: 100 }); exigir(r.estado === 'SOLUCAO' && r.houveBacktracking, 'Resultado não informou backtracking.') })
caso('BK', 'Todos os pets TaxiDog respeitam deadline', () => { const d = etapaUnicaHumana(baseLote(), 15); d.funcionarios = [d.funcionarios[0]]; d.ciclosTaxidog = [ciclo('manha', 540, 570)]; const r = planejarLoteEmMemoria([solicitacao('a', 'pet', 'banho', 'taxidog'), solicitacao('b', 'pet-b', 'banho', 'taxidog')], d); exigir(r.estado === 'SOLUCAO' && r.planejamentos.every((item) => item.opcao.cicloTaxidog && item.opcao.conclusaoPrevista <= item.opcao.cicloTaxidog.conclusaoLimite), 'Um pet ultrapassou o deadline.') })
caso('BL', 'Retirada conjunta usa último pet', () => { const r = planejarLoteEmMemoria([solicitacao('a', 'pet'), solicitacao('b', 'pet-b')], etapaUnicaHumana()); exigir(r.estado === 'SOLUCAO' && r.retiradaPrevistaGrupo === Math.max(...r.planejamentos.map((item) => item.opcao.conclusaoPrevista)), 'Retirada conjunta incorreta.') })

function cenarioAcoplado() {
  const d = fixture()
  d.acoplamentos = [{ servicoId: 'hidratacao', etapaAlvoId: 'lavar', ativo: true }]
  d.blocosEstabelecimento[0].fim = 620
  d.jornadas.forEach((item) => { item.fim = 620 })
  return d
}

const entradaHidratacao = { ...entradaBase, servicoIds: ['hidratacao'] }

caso('BM', 'Serviço normal mantém etapas próprias', () => { const d = cenarioAcoplado(); d.acoplamentos = []; exigir(horario(executar(d, entradaHidratacao))?.etapas.length === 4, 'Fluxo normal foi alterado.') })
caso('BN', 'Serviço acoplado não cria etapa posterior', () => { const etapas = horario(executar(cenarioAcoplado(), entradaHidratacao))?.etapas; exigir(etapas?.length === 3 && !etapas.some((item) => item.etapaId === 'hidratar'), 'Acoplado permaneceu sequencial.') })
caso('BO', 'Acoplado aumenta duração da etapa alvo', () => { exigir(horario(executar(cenarioAcoplado(), entradaHidratacao))?.etapas[0].duracaoMinutos === 35, 'Duração não foi consolidada.') })
caso('BP', 'Etapa posterior é deslocada', () => { exigir(horario(executar(cenarioAcoplado(), entradaHidratacao))?.etapas[1].inicio === 575, 'Etapa posterior não foi deslocada.') })
caso('BQ', 'Conclusão prevista é recalculada', () => { exigir(horario(executar(cenarioAcoplado(), entradaHidratacao))?.conclusaoPrevista === 615, 'Conclusão consolidada incorreta.') })
caso('BR', 'Deadline TaxiDog considera acoplado', () => { const d = cenarioAcoplado(); d.ciclosTaxidog = [ciclo('manha', 540, 610)]; exigir(executar(d, { ...entradaHidratacao, modalidade: 'taxidog', cicloTaxidogId: 'manha' }).estado === 'SEM_DISPONIBILIDADE', 'Deadline ignorou contribuição.') })
caso('BS', 'Acoplado não solicitado não altera fluxo', () => { const etapa = horario(executar(cenarioAcoplado()))?.etapas[0]; exigir(etapa?.duracaoMinutos === 30 && etapa.contribuicoesAcopladas.length === 0, 'Acoplado não solicitado foi aplicado.') })
caso('BT', 'Dependência automática continua funcionando', () => { exigir(horario(executar(cenarioAcoplado(), entradaHidratacao))?.servicos.map((item) => item.id).join(',') === 'banho,hidratacao', 'Dependência deixou de ser oficial.') })

function adicionarTratamento(d: DadosDisponibilidade) {
  d.blocosEstabelecimento[0].fim = Math.max(d.blocosEstabelecimento[0].fim, 630)
  d.jornadas.forEach((item) => { item.fim = Math.max(item.fim, 630) })
  d.servicos.push({ id: 'tratamento', nome: 'Tratamento', ativo: true })
  d.dependencias.push({ servicoId: 'tratamento', dependenciaServicoId: 'banho', ativo: true })
  d.acoplamentos.push({ servicoId: 'tratamento', etapaAlvoId: 'lavar', ativo: true })
  d.elegibilidade.especies.push({ servicoId: 'tratamento', especie: 'cao', ativo: true })
  d.elegibilidade.portes.push({ servicoId: 'tratamento', porte: 'pequeno', ativo: true })
  d.etapas.push({ id: 'tratar', servicoId: 'tratamento', nome: 'Tratamento', ordem: 1, duracaoMinutos: 7, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null })
  d.recursosEtapas.push({ id: 'rf-tratar', servicoEtapaId: 'tratar', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true })
  for (const funcionario of d.funcionarios) d.habilitacoes.servicos.push({ funcionarioId: funcionario.id, servicoId: 'tratamento', ativo: true })
}

caso('BU', 'Dois acoplados são consolidados', () => { const d = cenarioAcoplado(); adicionarTratamento(d); const etapa = horario(executar(d, { ...entradaBase, servicoIds: ['hidratacao', 'tratamento'] }))?.etapas[0]; exigir(etapa?.contribuicoesAcopladas.length === 2 && etapa.duracaoMinutos === 42, 'Múltiplos acoplados incorretos.') })
caso('BV', 'Soma das contribuições é determinística', () => { const d = cenarioAcoplado(); adicionarTratamento(d); const a = horario(executar(d, { ...entradaBase, servicoIds: ['tratamento', 'hidratacao'] }))?.etapas[0]; const b = horario(executar(d, { ...entradaBase, servicoIds: ['hidratacao', 'tratamento'] }))?.etapas[0]; exigir(a?.duracaoMinutos === b?.duracaoMinutos && a?.duracaoMinutos === 42, 'Soma dependeu da ordem da entrada.') })
caso('BW', 'Planejador de lote usa duração consolidada', () => { const d = cenarioAcoplado(); d.pets.push({ ...d.pets[0], id: 'pet-b', nome: 'B' }); d.blocosEstabelecimento[0].fim = 690; d.jornadas.forEach((item) => { item.fim = 690 }); const r = planejarLoteEmMemoria([{ id: 'a', entrada: entradaHidratacao }, { id: 'b', entrada: { ...entradaHidratacao, petId: 'pet-b' } }], d); exigir(r.estado === 'SOLUCAO' && r.planejamentos.every((item) => item.opcao.etapas[0].duracaoMinutos === 35), 'Lote perdeu a consolidação.') })
caso('BX', 'Ocupações temporárias usam intervalo consolidado', () => { const d = cenarioAcoplado(); d.pets.push({ ...d.pets[0], id: 'pet-b', nome: 'B' }); d.blocosEstabelecimento[0].fim = 690; d.jornadas.forEach((item) => { item.fim = 690 }); d.funcionarios = [d.funcionarios[0]]; d.habilitacoes.servicos = d.habilitacoes.servicos.filter((item) => item.funcionarioId === 'agata'); const r = planejarLoteEmMemoria([{ id: 'a', entrada: entradaHidratacao }, { id: 'b', entrada: { ...entradaHidratacao, petId: 'pet-b' } }], d); const banhos = r.planejamentos.map((item) => item.opcao.etapas[0]); exigir(r.estado === 'SOLUCAO' && naoSobrepoe(banhos[0], banhos[1]) && banhos.every((item) => item.fim - item.inicio === 35), 'Reserva temporária não refletiu o consolidado.') })
caso('BY', 'Habilitações do acoplado são validadas', () => { const d = cenarioAcoplado(); d.habilitacoes.servicos = d.habilitacoes.servicos.filter((item) => item.servicoId !== 'hidratacao'); exigir(executar(d, entradaHidratacao).estado === 'SEM_DISPONIBILIDADE', 'Habilitação própria foi ignorada.') })
caso('BZ', 'Serviço normal não sofre regressão', () => { const d = cenarioAcoplado(); d.acoplamentos = []; const normal = horario(executar(d)); const configurado = horario(executar(cenarioAcoplado())); exigir(normal?.conclusaoPrevista === configurado?.conclusaoPrevista && normal?.etapas.length === configurado?.etapas.length, 'Cadastro não solicitado alterou serviço normal.') })
caso('CA', 'Configuração inválida é rejeitada', () => { const d = cenarioAcoplado(); d.dependencias = []; exigir(executar(d, { ...entradaBase, servicoIds: ['banho', 'hidratacao'] }).estado === 'SERVICO_INVALIDO', 'Acoplamento sem dependência foi aceito.') })
caso('CB', 'Ciclo de acoplamento é rejeitado', () => { const d = cenarioAcoplado(); d.acoplamentos.push({ servicoId: 'banho', etapaAlvoId: 'hidratar', ativo: true }); d.dependencias.push({ servicoId: 'banho', dependenciaServicoId: 'hidratacao', ativo: true }); exigir(executar(d, entradaHidratacao).estado === 'SERVICO_INVALIDO', 'Ciclo foi aceito.') })
caso('CC', 'Modificador por porte afeta contribuição', () => { const d = cenarioAcoplado(); d.modificadoresDuracao.push({ id: 'h-porte', servicoId: 'hidratacao', servicoEtapaId: 'hidratar', criterio: 'porte', acrescimoMinutos: 3, ativo: true, racaId: null, porte: 'pequeno', pelagem: null, temperamento: null, pesoMin: null, pesoMax: null }); const etapa = horario(executar(d, entradaHidratacao))?.etapas[0]; exigir(etapa?.duracaoMinutos === 38 && etapa.contribuicoesAcopladas[0].modificadoresAplicados.includes('h-porte'), 'Modificador do acoplado foi perdido.') })
caso('CD', 'Modificador por pelagem afeta contribuição', () => { const d = cenarioAcoplado(); d.modificadoresDuracao.push({ id: 'h-pelo', servicoId: 'hidratacao', servicoEtapaId: 'hidratar', criterio: 'pelagem', acrescimoMinutos: 4, ativo: true, racaId: null, porte: null, pelagem: 'curta', temperamento: null, pesoMin: null, pesoMax: null }); exigir(horario(executar(d, entradaHidratacao))?.etapas[0].duracaoMinutos === 39, 'Pelagem do acoplado foi ignorada.') })
caso('CE', 'Funcionário precisa das duas habilitações', () => { const d = cenarioAcoplado(); d.habilitacoes.servicos = d.habilitacoes.servicos.filter((item) => item.servicoId !== 'hidratacao'); exigir(executar(d, entradaHidratacao).estado === 'SEM_DISPONIBILIDADE', 'Funcionário apenas do serviço base foi aceito.') })
caso('CF', 'Preferência obrigatória valida acoplado', () => { const d = cenarioAcoplado(); d.habilitacoes.servicos = d.habilitacoes.servicos.filter((item) => !(item.funcionarioId === 'agata' && item.servicoId === 'hidratacao')); exigir(executar(d, { ...entradaHidratacao, preferenciaFuncionario: 'obrigatorio', funcionarioPreferidoId: 'agata' }).estado === 'SEM_DISPONIBILIDADE', 'Preferido sem habilitação foi aceito.') })
caso('CG', 'Equipamento do acoplado é alocado', () => { const d = cenarioAcoplado(); d.recursosEtapas.push({ id: 'h-maq', servicoEtapaId: 'hidratar', tipo: 'equipamento', equipamentoId: 'maq', quantidade: 1, ativo: true }); exigir(horario(executar(d, entradaHidratacao))?.etapas[0].equipamentos.length === 1, 'Equipamento acoplado não foi incorporado.') })
caso('CH', 'Supervisão do acoplado é preservada', () => { const d = cenarioAcoplado(); d.recursosEtapas.push({ id: 'h-maq', servicoEtapaId: 'hidratar', tipo: 'equipamento', equipamentoId: 'maq', quantidade: 1, ativo: true }); d.equipamentos[0].exigeSupervisaoHumana = true; exigir((horario(executar(d, entradaHidratacao))?.etapas[0].equipamentos[0].supervisores.length ?? 0) > 0, 'Supervisão do recurso acoplado sumiu.') })
caso('CI', 'Espera pertence à etapa alvo consolidada', () => { const d = cenarioAcoplado(); d.blocosEstabelecimento[0].fim = 630; d.jornadas.forEach((item) => { item.fim = 630 }); d.reservasEquipamentos = [{ id: 'u1', unidadeId: 'u1', inicio: 575, fim: 580, porte: 'pequeno', sexo: 'macho' }, { id: 'u2', unidadeId: 'u2', inicio: 575, fim: 580, porte: 'pequeno', sexo: 'macho' }]; const opcao = horario(executar(d, entradaHidratacao)); exigir(Boolean(opcao) && opcao!.esperas.every((item) => item.antesDaEtapaId !== 'hidratar'), 'Acoplado criou ponto de espera.') })
caso('CJ', 'Etapa alvo fora do fluxo é rejeitada', () => { const d = cenarioAcoplado(); d.acoplamentos[0].etapaAlvoId = 'inexistente'; exigir(executar(d, entradaHidratacao).estado === 'SERVICO_INVALIDO', 'Alvo inexistente foi aceito.') })
caso('CK', 'Base incluída somente por dependência funciona', () => { const opcao = horario(executar(cenarioAcoplado(), entradaHidratacao)); exigir(opcao?.servicos[0].origem === 'dependencia' && opcao.etapas[0].contribuicoesAcopladas.length === 1, 'Base automática não recebeu contribuição.') })
caso('CL', 'Acoplado inativo é rejeitado', () => { const d = cenarioAcoplado(); d.servicos.find((item) => item.id === 'hidratacao')!.ativo = false; exigir(executar(d, entradaHidratacao).estado === 'SERVICO_INVALIDO', 'Serviço inativo foi executado.') })
caso('CM', 'Metadados acoplados têm ordem determinística', () => { const d = cenarioAcoplado(); adicionarTratamento(d); const ids = horario(executar(d, { ...entradaBase, servicoIds: ['tratamento', 'hidratacao'] }))?.etapas[0].contribuicoesAcopladas.map((item) => item.servicoId); exigir(ids?.join(',') === 'tratamento,hidratacao', 'Ordem explicável não é determinística.') })
caso('CN', 'Lote bloqueia pelo intervalo ampliado', () => { const d = cenarioAcoplado(); d.pets.push({ ...d.pets[0], id: 'pet-b', nome: 'B' }); d.blocosEstabelecimento[0].fim = 610; d.jornadas.forEach((item) => { item.fim = 610 }); d.funcionarios = [d.funcionarios[0]]; d.habilitacoes.servicos = d.habilitacoes.servicos.filter((item) => item.funcionarioId === 'agata'); const r = planejarLoteEmMemoria([{ id: 'a', entrada: entradaHidratacao }, { id: 'b', entrada: { ...entradaHidratacao, petId: 'pet-b' } }], d); exigir(r.estado !== 'SOLUCAO', 'Lote ignorou ocupação ampliada.') })
caso('CO', 'Etapa normal mantém somente o nome principal', () => { const etapa = horario(executar(fixture()))!.etapas[0]; exigir(rotuloEtapaComAcoplamentos(etapa) === 'Banho', 'Rótulo normal foi alterado.') })
caso('CP', 'Acoplado aparece no nome explicável', () => { const etapa = horario(executar(cenarioAcoplado(), entradaHidratacao))!.etapas[0]; exigir(rotuloEtapaComAcoplamentos(etapa) === 'Banho + Hidratação', 'Rótulo acoplado incorreto.') })
caso('CQ', 'Nomes acoplados não são duplicados', () => { const etapa = horario(executar(cenarioAcoplado(), entradaHidratacao))!.etapas[0]; const repetida = { ...etapa, contribuicoesAcopladas: [...etapa.contribuicoesAcopladas, etapa.contribuicoesAcopladas[0]] }; exigir(rotuloEtapaComAcoplamentos(repetida) === 'Banho + Hidratação', 'Nome acoplado foi repetido.') })
caso('CR', 'Ordem visual é determinística', () => { const d = cenarioAcoplado(); adicionarTratamento(d); const etapa = horario(executar(d, { ...entradaBase, servicoIds: ['tratamento', 'hidratacao'] }))!.etapas[0]; exigir(rotuloEtapaComAcoplamentos(etapa) === 'Banho + Tratamento + Hidratação', 'Ordem visual divergiu da ordem estrutural.') })
caso('CS', 'Apresentação não modifica cálculo', () => { const etapa = horario(executar(cenarioAcoplado(), entradaHidratacao))!.etapas[0]; const antes = JSON.stringify({ inicio: etapa.inicio, fim: etapa.fim, duracao: etapa.duracaoMinutos, funcionarios: etapa.funcionarios, equipamentos: etapa.equipamentos }); rotuloEtapaComAcoplamentos(etapa); const depois = JSON.stringify({ inicio: etapa.inicio, fim: etapa.fim, duracao: etapa.duracaoMinutos, funcionarios: etapa.funcionarios, equipamentos: etapa.equipamentos }); exigir(antes === depois, 'Formatador alterou a alocação.') })
caso('CT', 'Lote preserva explicação dos acoplados', () => { const d = cenarioAcoplado(); const r = planejarLoteEmMemoria([{ id: 'a', entrada: entradaHidratacao }], d); const etapa = r.planejamentos[0]?.opcao.etapas[0]; exigir(Boolean(etapa) && rotuloEtapaComAcoplamentos(etapa!) === 'Banho + Hidratação', 'Lote descartou a explicação.') })

function resolverGrafo(solicitados: string[], arestas: [string, string][]) {
  const dados = fixture()
  const ids = [...new Set([...solicitados, ...arestas.flatMap(([pai, filho]) => [pai, filho])])]
  dados.servicos = ids.map((id) => ({ id, nome: id, ativo: true }))
  dados.dependencias = arestas.map(([pai, filho]) => ({ servicoId: pai, dependenciaServicoId: filho, ativo: true }))
  return resolverServicos({ ...entradaBase, servicoIds: solicitados }, dados)
}

function servicoPorId(servicos: ReturnType<typeof resolverGrafo>, id: string) {
  const servico = servicos.find((item) => item.id === id)
  if (!servico) throw new Error(`Serviço resolvido ausente: ${id}.`)
  return servico
}

function assinaturaProveniencia(servicos: ReturnType<typeof resolverGrafo>) {
  return JSON.stringify([...servicos]
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(({ id, origem, paisDiretos, raizesSolicitadas }) => ({ id, origem, paisDiretos, raizesSolicitadas })))
}

caso('CU', 'Dependência simples preserva pai direto', () => {
  const b = servicoPorId(resolverGrafo(['A'], [['A', 'B']]), 'B')
  exigir(b.paisDiretos.join(',') === 'A' && b.raizesSolicitadas.join(',') === 'A', 'Proveniência simples incorreta.')
})
caso('CV', 'Dependência transitiva preserva pais diretos', () => {
  const servicos = resolverGrafo(['A'], [['A', 'B'], ['B', 'C']])
  exigir(servicoPorId(servicos, 'B').paisDiretos.join(',') === 'A' && servicoPorId(servicos, 'C').paisDiretos.join(',') === 'B', 'Aresta transitiva substituiu o pai direto.')
})
caso('CW', 'Dependência compartilhada permanece deduplicada', () => {
  const servicos = resolverGrafo(['A', 'B'], [['A', 'C'], ['B', 'C']])
  exigir(servicos.filter((item) => item.id === 'C').length === 1, 'Dependência compartilhada foi duplicada.')
})
caso('CX', 'Dependência compartilhada preserva todos os pais', () => {
  const c = servicoPorId(resolverGrafo(['A', 'B'], [['A', 'C'], ['B', 'C']]), 'C')
  exigir(c.paisDiretos.join(',') === 'A,B' && c.raizesSolicitadas.join(',') === 'A,B', 'Múltiplos pais ou raízes foram perdidos.')
})
caso('CY', 'Ordem das relações não altera a proveniência', () => {
  const a = resolverGrafo(['A', 'B'], [['B', 'C'], ['A', 'C']])
  const b = resolverGrafo(['A', 'B'], [['A', 'C'], ['B', 'C']])
  exigir(assinaturaProveniencia(a) === assinaturaProveniencia(b), 'Proveniência dependeu da ordem das relações.')
})
caso('CZ', 'Ordem dos solicitados não perde proveniência', () => {
  const a = resolverGrafo(['A', 'B'], [['A', 'C'], ['B', 'C']])
  const b = resolverGrafo(['B', 'A'], [['A', 'C'], ['B', 'C']])
  exigir(assinaturaProveniencia(a) === assinaturaProveniencia(b), 'Ordem dos solicitados alterou a proveniência.')
})
caso('DA', 'Ciclo de dependências continua detectado', () => {
  let detectado = false
  try { resolverGrafo(['A'], [['A', 'B'], ['B', 'A']]) } catch (erro) { detectado = erro instanceof Error && erro.message.includes('Ciclo') }
  exigir(detectado, 'Ciclo não foi rejeitado.')
})
caso('DB', 'Solicitado que também é dependência é determinístico', () => {
  const a = servicoPorId(resolverGrafo(['A', 'B'], [['A', 'B']]), 'B')
  const b = servicoPorId(resolverGrafo(['B', 'A'], [['A', 'B']]), 'B')
  exigir(a.origem === 'solicitado' && b.origem === 'solicitado' && assinaturaProveniencia([a]) === assinaturaProveniencia([b]) && a.paisDiretos.join(',') === 'A' && a.raizesSolicitadas.join(',') === 'A,B', 'Classificação solicitada ou proveniência ficou incidental.')
})
caso('DC', 'Grafo combinado preserva todas as arestas diretas', () => {
  const servicos = resolverGrafo(['A', 'C'], [['A', 'B'], ['B', 'D'], ['C', 'D']])
  const b = servicoPorId(servicos, 'B')
  const d = servicoPorId(servicos, 'D')
  exigir(b.paisDiretos.join(',') === 'A' && d.paisDiretos.join(',') === 'B,C' && d.raizesSolicitadas.join(',') === 'A,C' && servicos.filter((item) => item.id === 'D').length === 1, 'Grafo combinado perdeu arestas diretas ou deduplicação.')
})

function regraPreco(id: string, servicoId: string, criterio: DadosDisponibilidade['modificadoresDuracao'][number]['criterio'], acrescimoValor: number, valor: string | [number | null, number | null], ativo = true) {
  return {
    id, servicoId, criterio, acrescimoValor, ativo,
    porte: criterio === 'porte' ? valor as 'pequeno' : null,
    pelagem: criterio === 'pelagem' ? valor as 'curta' : null,
    racaId: criterio === 'raca' ? valor as string : null,
    pesoMin: criterio === 'peso' ? (valor as [number | null, number | null])[0] : null,
    pesoMax: criterio === 'peso' ? (valor as [number | null, number | null])[1] : null,
    temperamento: criterio === 'temperamento' ? valor as 'calmo' : null,
  }
}

function precificarGrafo(solicitados: string[], arestas: [string, string][] = [], precos: Record<string, number> = {}, regras: ReturnType<typeof regraPreco>[] = []) {
  const resolvidos = resolverGrafo(solicitados, arestas)
  const pet = fixture().pets[0]
  return calcularPrecificacao(pet, resolvidos, {
    servicos: resolvidos.map((item) => ({ id: item.id, nome: item.nome, precoBase: precos[item.id] ?? 10, ativo: true })),
    regrasPreco: regras,
  })
}

caso('DD', 'Preço base é calculado por serviço', () => {
  const resultado = precificarGrafo(['A'], [], { A: 49.9 })
  exigir(resultado.servicos[0].precoBaseSnapshot === 49.9 && resultado.servicos[0].valorCalculado === 49.9 && resultado.valorCalculadoAtendimento === 49.9, 'Preço base não foi preservado.')
})
caso('DE', 'Regras aplicáveis de preço são cumulativas', () => {
  const resultado = precificarGrafo(['A'], [], { A: 50 }, [regraPreco('z', 'A', 'porte', 5, 'pequeno'), regraPreco('a', 'A', 'pelagem', 7.5, 'curta')])
  exigir(resultado.servicos[0].valorCalculado === 62.5 && resultado.servicos[0].acrescimos.length === 2, 'Acréscimos cumulativos incorretos.')
})
caso('DF', 'Regras inativas ou não aplicáveis são ignoradas', () => {
  const resultado = precificarGrafo(['A'], [], { A: 20 }, [regraPreco('inativa', 'A', 'porte', 5, 'pequeno', false), regraPreco('outro', 'A', 'raca', 8, 'outra-raca')])
  exigir(resultado.servicos[0].valorCalculado === 20 && resultado.servicos[0].acrescimos.length === 0, 'Regra indevida alterou o preço.')
})
caso('DG', 'Critérios raça e temperamento usam o snapshot do pet', () => {
  const resultado = precificarGrafo(['A'], [], { A: 10 }, [regraPreco('raca', 'A', 'raca', 2, 'srd'), regraPreco('temperamento', 'A', 'temperamento', 3, 'calmo')])
  exigir(resultado.servicos[0].valorCalculado === 15 && resultado.servicos[0].acrescimos.map((item) => item.valorReferenciaSnapshot).join(',') === 'SRD,calmo', 'Características do pet não foram aplicadas corretamente.')
})
caso('DH', 'Faixa de peso inclui os limites configurados', () => {
  const resultado = precificarGrafo(['A'], [], { A: 10 }, [regraPreco('peso', 'A', 'peso', 4, [8, 10])])
  exigir(resultado.servicos[0].valorCalculado === 14, 'Limite inclusivo de peso foi ignorado.')
})
caso('DI', 'Dependência automática possui cobrança própria', () => {
  const resultado = precificarGrafo(['Hidratacao'], [['Hidratacao', 'Banho']], { Hidratacao: 15, Banho: 50 })
  exigir(resultado.servicos.length === 2 && resultado.valorCalculadoAtendimento === 65 && resultado.servicos.find((item) => item.servicoId === 'Banho')?.origem === 'dependencia', 'Dependência não foi cobrada como serviço efetivo.')
})
caso('DJ', 'Dependência compartilhada é cobrada uma única vez', () => {
  const resultado = precificarGrafo(['A', 'B'], [['A', 'C'], ['B', 'C']], { A: 10, B: 20, C: 30 })
  exigir(resultado.servicos.filter((item) => item.servicoId === 'C').length === 1 && resultado.valorCalculadoAtendimento === 60, 'Dependência compartilhada foi cobrada mais de uma vez.')
})
caso('DK', 'Acréscimos produzem snapshots determinísticos', () => {
  const resultado = precificarGrafo(['A'], [], { A: 10.1 }, [regraPreco('z', 'A', 'porte', 0.2, 'pequeno'), regraPreco('a', 'A', 'pelagem', 0.3, 'curta')])
  const servico = resultado.servicos[0]
  exigir(servico.valorCalculado === 10.6 && servico.acrescimos.map((item) => item.regraPrecoId).join(',') === 'a,z' && servico.acrescimos.every((item) => item.descricaoSnapshot && item.valorReferenciaSnapshot), 'Snapshots ou aritmética monetária não são determinísticos.')
})

caso('DL', 'Sem sessão exige login', () => {
  exigir(classificarUsuarioInterno(null) === 'nao_autenticado', 'Ausência de sessão liberou acesso.')
})
caso('DM', 'Role internal concede acesso', () => {
  exigir(classificarUsuarioInterno({ app_metadata: { role: 'internal' } }) === 'autorizado', 'Role interna válida foi rejeitada.')
})
caso('DN', 'Authenticated sem role internal é negado', () => {
  exigir(classificarUsuarioInterno({ app_metadata: {} }) === 'sem_permissao', 'Usuário comum recebeu acesso interno.')
})
caso('DO', 'User metadata não concede autorização', () => {
  const usuario = { app_metadata: {}, user_metadata: { role: 'internal' } }
  exigir(classificarUsuarioInterno(usuario) === 'sem_permissao', 'user_metadata foi usado como autorização.')
})
caso('DP', 'Logout remove acesso', () => {
  const antes = classificarUsuarioInterno({ app_metadata: { role: 'internal' } })
  const depois = classificarUsuarioInterno(null)
  exigir(antes === 'autorizado' && depois === 'nao_autenticado', 'Ausência de usuário após logout manteve acesso.')
})
caso('DQ', 'Restauração preserva usuário interno', () => {
  exigir(classificarUsuarioInterno({ app_metadata: { role: 'internal' } }) === 'autorizado', 'Sessão restaurada perdeu autorização.')
})
caso('DR', 'Sessão inválida retorna ao login', () => {
  exigir(classificarUsuarioInterno(null) === 'nao_autenticado', 'Sessão inválida não voltou ao login.')
})
caso('DS', 'Configuração frontend rejeita segredo administrativo', () => {
  exigir(!configuracaoFrontendContemSegredoAdministrativo(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) && configuracaoFrontendContemSegredoAdministrativo(['SERVICE-ROLE']), 'Detecção de segredo administrativo falhou.')
})

function intencaoConfirmacao(alteracoes: Partial<ConfirmacaoAgendamentoIntent> = {}): ConfirmacaoAgendamentoIntent {
  return {
    chaveIdempotencia: '123e4567-e89b-42d3-a456-426614174000',
    petId: 'pet',
    servicoIds: ['banho'],
    data: DATA,
    horarioEscolhido: 540,
    modalidade: 'sem_transporte',
    cicloTaxidogId: null,
    preferenciaFuncionario: 'automatico',
    funcionarioPreferidoId: null,
    versaoConfiguracaoConsultada: 10,
    versaoOcupacaoConsultada: 20,
    ...alteracoes,
  }
}

caso('DT', 'Intenção normal é válida', () => {
  exigir(validarIntencaoConfirmacao(intencaoConfirmacao()).length === 0, 'Intenção normal válida foi rejeitada.')
})
caso('DU', 'TaxiDog exige ciclo', () => {
  const erros = validarIntencaoConfirmacao(intencaoConfirmacao({ modalidade: 'taxidog' }))
  exigir(erros.some((item) => item.campo === 'cicloTaxidogId'), 'TaxiDog sem ciclo foi aceito.')
})
caso('DV', 'Sem transporte rejeita ciclo indevido', () => {
  const erros = validarIntencaoConfirmacao(intencaoConfirmacao({ cicloTaxidogId: 'manha' }))
  exigir(erros.some((item) => item.campo === 'cicloTaxidogId'), 'Ciclo indevido foi aceito sem transporte.')
})
caso('DW', 'Preferência obrigatória exige funcionário', () => {
  const erros = validarIntencaoConfirmacao(intencaoConfirmacao({ preferenciaFuncionario: 'obrigatorio' }))
  exigir(erros.some((item) => item.campo === 'funcionarioPreferidoId'), 'Preferência obrigatória sem funcionário foi aceita.')
})
caso('DX', 'Automático não exige funcionário', () => {
  exigir(validarIntencaoConfirmacao(intencaoConfirmacao({ preferenciaFuncionario: 'automatico', funcionarioPreferidoId: null })).length === 0, 'Automático exigiu funcionário.')
})
caso('DY', 'Versões consultadas são preservadas', () => {
  const normalizada = normalizarIntencaoParaHash(intencaoConfirmacao({ versaoConfiguracaoConsultada: 31, versaoOcupacaoConsultada: 47 }))
  exigir(normalizada.versaoConfiguracaoConsultada === 31 && normalizada.versaoOcupacaoConsultada === 47, 'Versões foram descartadas.')
})
caso('DZ', 'Serviços são normalizados deterministicamente', () => {
  const normalizada = normalizarIntencaoParaHash(intencaoConfirmacao({ servicoIds: ['tratamento', 'banho', 'tratamento'] }))
  exigir(normalizada.servicoIds.join(',') === 'banho,tratamento', 'Serviços não foram ordenados e deduplicados.')
})
caso('EA', 'Intenções equivalentes têm representação igual', () => {
  const a = serializarIntencaoParaHash(intencaoConfirmacao({ servicoIds: ['banho', 'hidratacao'] }))
  const b = serializarIntencaoParaHash(intencaoConfirmacao({ servicoIds: ['hidratacao', 'banho'] }))
  exigir(a === b, 'Ordem incidental alterou a representação canônica.')
})
caso('EB', 'Nova tentativa recebe nova chave de idempotência', () => {
  const a = gerarChaveIdempotencia()
  const b = gerarChaveIdempotencia()
  exigir(a !== b && validarIntencaoConfirmacao(intencaoConfirmacao({ chaveIdempotencia: a })).length === 0 && serializarIntencaoParaHash(intencaoConfirmacao({ chaveIdempotencia: a })) === serializarIntencaoParaHash(intencaoConfirmacao({ chaveIdempotencia: b })), 'Chaves não diferenciaram tentativas ou contaminaram o payload normalizado.')
})
caso('EC', 'Resposta confirmado é discriminada', () => {
  const resposta: ConfirmacaoAgendamentoResposta = { status: 'confirmado', atendimentoId: 'a', grupoAgendamentoId: 'g', statusAtendimento: 'confirmado', horarioConfirmado: 540, conclusaoPrevista: 600, valorFinal: 50, versaoConfiguracao: 1, versaoOcupacao: 2, reutilizadoPorIdempotencia: false, servicos: [] }
  exigir(resposta.status === 'confirmado' && resposta.atendimentoId === 'a', 'Resposta confirmada perdeu sua discriminação.')
})
caso('ED', 'Resposta disponibilidade alterada é discriminada', () => {
  const resposta: ConfirmacaoAgendamentoResposta = { status: 'disponibilidade_alterada', codigo: 'HORARIO_INDISPONIVEL', mensagem: 'Horário indisponível.', versaoOcupacaoAtual: 3 }
  exigir(resposta.status === 'disponibilidade_alterada' && resposta.codigo === 'HORARIO_INDISPONIVEL', 'Mudança de disponibilidade não foi discriminada.')
})
caso('EE', 'Resposta configuração alterada é discriminada', () => {
  const resposta: ConfirmacaoAgendamentoResposta = { status: 'configuracao_alterada', codigo: 'CONFIGURACAO_ALTERADA', mensagem: 'Configuração mudou.', versaoConfiguracaoConsultada: 1, versaoConfiguracaoAtual: 2 }
  exigir(resposta.status === 'configuracao_alterada' && resposta.versaoConfiguracaoAtual === 2, 'Mudança de configuração não foi discriminada.')
})
caso('EF', 'Erro de domínio possui código tipado', () => {
  const codigo: CodigoDominioConfirmacao = 'IDEMPOTENCIA_CONFLITANTE'
  const resposta: ConfirmacaoAgendamentoResposta = { status: 'invalido', codigo, mensagem: 'A chave pertence a outra intenção.' }
  exigir(resposta.status === 'invalido' && resposta.codigo === codigo, 'Código de domínio foi perdido.')
})
caso('EG', 'Intenção não transporta preço como autoridade', () => {
  exigir(!Object.keys(intencaoConfirmacao()).some((chave) => ['preco', 'valorFinal', 'valorCalculado'].includes(chave)), 'Payload contém preço autoritativo.')
})
caso('EH', 'Intenção não transporta plano operacional', () => {
  exigir(!Object.keys(intencaoConfirmacao()).some((chave) => ['etapas', 'recursos', 'funcionarios', 'equipamentos', 'supervisores'].includes(chave)), 'Payload contém plano operacional.')
})
caso('EI', 'TaxiDog não transporta horário ou deadline como autoridade', () => {
  const intencao = intencaoConfirmacao({ modalidade: 'taxidog', cicloTaxidogId: 'manha', horarioEscolhido: null })
  exigir(validarIntencaoConfirmacao(intencao).length === 0 && !Object.keys(intencao).some((chave) => ['coletaInicio', 'coletaFim', 'conclusaoLimite', 'deadline'].includes(chave)), 'TaxiDog transportou dados autoritativos do ciclo.')
})
caso('EJ', 'Resposta representa reutilização idempotente', () => {
  const resposta: ConfirmacaoAgendamentoResposta = { status: 'confirmado', atendimentoId: 'a', grupoAgendamentoId: 'g', statusAtendimento: 'confirmado', horarioConfirmado: 540, conclusaoPrevista: 600, valorFinal: 50, versaoConfiguracao: 1, versaoOcupacao: 2, reutilizadoPorIdempotencia: true, servicos: [] }
  exigir(resposta.status === 'confirmado' && resposta.reutilizadoPorIdempotencia, 'Reutilização idempotente não é representável.')
})

function exigirEquivalenciaDirecionada(dados: DadosDisponibilidade, entrada: EntradaDisponibilidade, minuto: number) {
  const completa = calcularDisponibilidade(entrada, dados).opcoes.find((item) => item.horarioApresentado === minuto)
  const direcionada = calcularDisponibilidadeNoHorario(entrada, dados, minuto).opcoes[0]
  exigir(JSON.stringify(direcionada) === JSON.stringify(completa), `Resultado direcionado divergiu do Motor completo em ${minuto}.`)
}

caso('EK', 'Direcionado equivale em serviço simples', () => {
  const d = fixture()
  d.etapas = [{ id: 'livre', servicoId: 'banho', nome: 'Livre', ordem: 1, duracaoMinutos: 20, ativo: true, politicaEsperaAntes: 'padrao', esperaAntesMinutos: null }]
  d.recursosEtapas = []
  exigirEquivalenciaDirecionada(d, entradaBase, 540)
})
caso('EL', 'Direcionado equivale em múltiplas etapas', () => exigirEquivalenciaDirecionada(fixture(), entradaBase, 540))
caso('EM', 'Direcionado equivale com funcionário', () => exigirEquivalenciaDirecionada(etapaUnicaHumana(), entradaBase, 540))
caso('EN', 'Direcionado equivale com equipamento', () => {
  const d = somenteEquipamento(30); d.equipamentos[0].exigeSupervisaoHumana = false
  exigirEquivalenciaDirecionada(d, entradaBase, 540)
})
caso('EO', 'Direcionado equivale com funcionário e equipamento', () => {
  const d = somenteEquipamento(30); d.equipamentos[0].exigeSupervisaoHumana = false
  d.recursosEtapas.push({ id: 'rh', servicoEtapaId: 'secar', tipo: 'funcionario', equipamentoId: null, quantidade: 1, ativo: true })
  exigirEquivalenciaDirecionada(d, entradaBase, 540)
})
caso('EP', 'Direcionado preserva preferência automática', () => exigirEquivalenciaDirecionada(fixture(), entradaBase, 540))
caso('EQ', 'Direcionado preserva preferência preferencial', () => exigirEquivalenciaDirecionada(etapaUnicaHumana(), { ...entradaBase, preferenciaFuncionario: 'preferencial', funcionarioPreferidoId: 'bruno' }, 540))
caso('ER', 'Direcionado preserva preferência obrigatória', () => exigirEquivalenciaDirecionada(etapaUnicaHumana(), { ...entradaBase, preferenciaFuncionario: 'obrigatorio', funcionarioPreferidoId: 'bruno' }, 540))
caso('ES', 'Direcionado rejeita ocupação conflitante', () => {
  const d = etapaUnicaHumana(); d.reservasFuncionarios = d.funcionarios.map((item) => ({ id: item.id, funcionarioId: item.id, inicio: 540, fim: 570 }))
  exigirEquivalenciaDirecionada(d, entradaBase, 540)
})
caso('ET', 'Direcionado preserva espera entre etapas', () => {
  const d = simples(); d.reservasFuncionarios = d.funcionarios.map((item) => ({ id: item.id, funcionarioId: item.id, inicio: 570, fim: 580 }))
  exigirEquivalenciaDirecionada(d, entradaBase, 540)
})
caso('EU', 'Direcionado preserva TaxiDog', () => {
  const d = somenteEquipamento(30); d.ciclosTaxidog = [ciclo()]
  exigirEquivalenciaDirecionada(d, entradaTaxi(), 540)
})
caso('EV', 'Direcionado preserva dependência', () => exigirEquivalenciaDirecionada(fixture(), { ...entradaBase, servicoIds: ['hidratacao'] }, 540))
caso('EW', 'Direcionado rejeita horário fora da granularidade', () => exigirEquivalenciaDirecionada(fixture(), entradaBase, 545))
caso('EX', 'Direcionado rejeita horário fora do bloco', () => exigirEquivalenciaDirecionada(fixture(), entradaBase, 480))
caso('EY', 'Direcionado avalia somente um candidato externo', () => {
  const d = etapaUnicaHumana()
  let filtrosFuncionarios = 0
  const funcionarios = d.funcionarios
  d.funcionarios = new Proxy(funcionarios, {
    get(alvo, propriedade, receptor) {
      if (propriedade === 'filter') return (...argumentos: Parameters<typeof alvo.filter>) => {
        filtrosFuncionarios += 1
        return alvo.filter(...argumentos)
      }
      return Reflect.get(alvo, propriedade, receptor)
    },
  })
  calcularDisponibilidadeNoHorario(entradaBase, d, 540)
  exigir(filtrosFuncionarios === 2, `Foram detectadas ${filtrosFuncionarios} avaliações; esperado diagnóstico + um candidato.`)
})
caso('EZ', 'Disponibilidade de ciclo preserva a melhor opção oficial', () => {
  const d = somenteEquipamento(30); d.ciclosTaxidog = [ciclo()]
  const resultado = calcularDisponibilidade(entradaTaxi(), d)
  const cicloDisponivel = resumirDisponibilidadeDoCiclo(resultado)
  exigir(cicloDisponivel.disponivel, 'Ciclo deveria possuir solução real.')
  exigir(cicloDisponivel.opcao === resultado.opcoes[0], 'Resumo reordenou ou substituiu a melhor opção do Motor.')
})
