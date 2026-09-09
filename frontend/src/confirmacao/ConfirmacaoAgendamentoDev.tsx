import Button from '../components/ui/Button.tsx'
import Modal from '../components/ui/Modal.tsx'
import { minutosParaHora, rotuloEtapaComAcoplamentos } from '../motorDisponibilidade/index.ts'
import type { OpcaoDisponibilidade, PreferenciaFuncionario } from '../motorDisponibilidade/tipos.ts'
import type {
  ConfirmacaoAgendamentoIntent,
  ConfirmacaoAgendamentoResposta,
} from './contrato.ts'

type Props = {
  aberto: boolean
  petNome: string
  opcao: OpcaoDisponibilidade | null
  intencao: ConfirmacaoAgendamentoIntent | null
  preferenciaFuncionario: PreferenciaFuncionario
  confirmando: boolean
  resposta: ConfirmacaoAgendamentoResposta | null
  erroTecnico: string | null
  consultaInvalidada: boolean
  onClose: () => void
  onConfirmar: () => void
}

export default function ConfirmacaoAgendamentoDev({
  aberto,
  petNome,
  opcao,
  intencao,
  preferenciaFuncionario,
  confirmando,
  resposta,
  erroTecnico,
  consultaInvalidada,
  onClose,
  onConfirmar,
}: Props) {
  if (!opcao || !intencao) return null
  const podeConfirmar = !confirmando && !consultaInvalidada
  const retryConfirmado = resposta?.status === 'confirmado'

  return (
    <Modal aberto={aberto} titulo="Revisão da confirmação DEV" onClose={confirmando ? () => undefined : onClose} maxWidth="820px">
      <div className="confirmacao-dev">
        <p className="confirmacao-dev-aviso">
          Esta revisão é visual. O backend recalculará disponibilidade, preço e recursos antes de persistir.
        </p>

        <dl className="confirmacao-dev-resumo">
          <Item nome="Pet" valor={petNome} />
          <Item nome="Data" valor={formatarData(intencao.data)} />
          <Item nome="Início" valor={minutosParaHora(opcao.horarioApresentado)} />
          <Item nome="Conclusão prevista" valor={minutosParaHora(opcao.conclusaoPrevista)} />
          <Item nome="Modalidade" valor={intencao.modalidade === 'taxidog' ? 'TaxiDog' : 'Sem transporte'} />
          <Item nome="Preferência" valor={rotuloPreferencia(preferenciaFuncionario)} />
          <Item nome="Versão de configuração" valor={String(intencao.versaoConfiguracaoConsultada)} />
          <Item nome="Versão de ocupação" valor={String(intencao.versaoOcupacaoConsultada)} />
        </dl>

        {opcao.cicloTaxidog && (
          <section className="confirmacao-dev-secao">
            <h3>Ciclo TaxiDog</h3>
            <p>{opcao.cicloTaxidog.nome} · coleta {minutosParaHora(opcao.cicloTaxidog.coletaInicio)}–{minutosParaHora(opcao.cicloTaxidog.coletaFim)} · pronto até {minutosParaHora(opcao.cicloTaxidog.conclusaoLimite)}</p>
          </section>
        )}

        <section className="confirmacao-dev-secao">
          <h3>Serviços</h3>
          <ul>{opcao.servicos.map((servico) => <li key={servico.id}>{servico.nome} <small>{servico.origem === 'solicitado' ? 'solicitado' : 'dependência'}</small></li>)}</ul>
        </section>

        <section className="confirmacao-dev-secao">
          <h3>Etapas e recursos apresentados</h3>
          <div className="confirmacao-dev-etapas">
            {opcao.etapas.map((etapa) => (
              <article key={etapa.etapaId}>
                <strong>{rotuloEtapaComAcoplamentos(etapa, `${etapa.servicoNome} · ${etapa.nome}`)}</strong>
                <span>{minutosParaHora(etapa.inicio)}–{minutosParaHora(etapa.fim)}</span>
                {etapa.funcionarios.map((funcionario) => <small key={funcionario.id}>Funcionário: {funcionario.nome}</small>)}
                {etapa.equipamentos.map((equipamento) => <small key={equipamento.unidadeId}>Equipamento: {equipamento.equipamentoNome} · {equipamento.unidadeNome}</small>)}
                {!etapa.funcionarios.length && !etapa.equipamentos.length && <small>Sem recurso exclusivo</small>}
              </article>
            ))}
          </div>
        </section>

        {opcao.esperas.length > 0 && (
          <section className="confirmacao-dev-secao">
            <h3>Esperas operacionais</h3>
            <ul>{opcao.esperas.map((espera) => <li key={`${espera.antesDaEtapaId}-${espera.inicio}`}>{minutosParaHora(espera.inicio)}–{minutosParaHora(espera.fim)} · {espera.duracaoMinutos} min</li>)}</ul>
          </section>
        )}

        {(resposta || erroTecnico) && <ResultadoConfirmacao resposta={resposta} erroTecnico={erroTecnico} intencao={intencao} />}

        <div className="confirmacao-dev-acoes">
          <Button variant="secondary" onClick={onClose} disabled={confirmando}>Cancelar</Button>
          <Button onClick={onConfirmar} disabled={!podeConfirmar}>
            {confirmando ? 'Confirmando...' : retryConfirmado ? 'Testar retry idempotente DEV' : 'Confirmar atendimento DEV'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ResultadoConfirmacao({
  resposta,
  erroTecnico,
  intencao,
}: {
  resposta: ConfirmacaoAgendamentoResposta | null
  erroTecnico: string | null
  intencao: ConfirmacaoAgendamentoIntent
}) {
  if (erroTecnico) return <div className="confirmacao-dev-resultado erro" role="alert"><strong>Falha técnica</strong><p>{erroTecnico}</p></div>
  if (!resposta) return null
  if (resposta.status === 'confirmado') return (
    <div className="confirmacao-dev-resultado sucesso" role="status">
      <strong>Confirmado</strong>
      {resposta.reutilizadoPorIdempotencia && <p>Confirmação já existente reutilizada por idempotência.</p>}
      <dl>
        <Item nome="Código" valor={resposta.codigo ?? 'CONFIRMADO'} />
        <Item nome="Grupo" valor={resposta.grupoAgendamentoId} />
        <Item nome="Atendimento" valor={resposta.atendimentoId} />
        <Item nome="Status" valor={resposta.statusAtendimento} />
        <Item nome="Horário confirmado" valor={minutosParaHora(resposta.horarioConfirmado)} />
        <Item nome="Conclusão" valor={minutosParaHora(resposta.conclusaoPrevista)} />
        <Item nome="Valor final" valor={resposta.valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
        <Item nome="Configuração" valor={String(resposta.versaoConfiguracao)} />
        <Item nome="Ocupação consultada" valor={String(intencao.versaoOcupacaoConsultada)} />
        <Item nome="Ocupação retornada" valor={String(resposta.versaoOcupacao)} />
      </dl>
    </div>
  )
  return (
    <div className="confirmacao-dev-resultado aviso" role="alert">
      <strong>{resposta.codigo}</strong>
      <p>{mensagemDominio(resposta)}</p>
    </div>
  )
}

function Item({ nome, valor }: { nome: string; valor: string }) {
  return <div><dt>{nome}</dt><dd>{valor}</dd></div>
}

function mensagemDominio(resposta: Exclude<ConfirmacaoAgendamentoResposta, { status: 'confirmado' }>) {
  if (resposta.status === 'disponibilidade_alterada') return 'A disponibilidade desse horário mudou. Consulte novamente.'
  if (resposta.status === 'configuracao_alterada') return 'A configuração da agenda mudou desde esta consulta. Consulte novamente.'
  return resposta.mensagem
}

function rotuloPreferencia(preferencia: PreferenciaFuncionario) {
  return { automatico: 'Automática', preferencial: 'Preferencial', obrigatorio: 'Obrigatória' }[preferencia]
}

function formatarData(data: string) {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}
