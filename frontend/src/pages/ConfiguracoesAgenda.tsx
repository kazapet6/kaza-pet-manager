import { useEffect, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ConfiguracaoTaxidog from './ConfiguracaoTaxidog'
import {
  carregarBlocosEstabelecimento,
  montarSemana,
  salvarFuncionamentoSemanal,
  validarSemana,
  type BlocoEstabelecimento,
  type DiaFuncionamento,
} from '../data/funcionamentoAgenda'

const dias = [
  { valor: 1, nome: 'Segunda' },
  { valor: 2, nome: 'Terça' },
  { valor: 3, nome: 'Quarta' },
  { valor: 4, nome: 'Quinta' },
  { valor: 5, nome: 'Sexta' },
  { valor: 6, nome: 'Sábado' },
  { valor: 0, nome: 'Domingo' },
]

export default function ConfiguracoesAgenda() {
  const [aba, setAba] = useState<'funcionamento' | 'taxidog'>('funcionamento')
  const [semana, setSemana] = useState<DiaFuncionamento[]>([])
  const [blocos, setBlocos] = useState<BlocoEstabelecimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [configuracaoInicial, setConfiguracaoInicial] = useState(false)

  async function carregar() {
    setCarregando(true)
    setErro(null)

    try {
      const dados = await carregarBlocosEstabelecimento()
      setBlocos(dados)
      setSemana(montarSemana(dados))
      setConfiguracaoInicial(dados.length === 0)
    } catch (error) {
      setErro(mensagemErro(error))
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  function alterarDia(diaSemana: number, alteracao: Partial<DiaFuncionamento>) {
    setSucesso(false)
    setSemana((atual) =>
      atual.map((dia) =>
        dia.diaSemana === diaSemana ? { ...dia, ...alteracao } : dia,
      ),
    )
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const erroValidacao = validarSemana(semana)
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }

    setSalvando(true)
    setErro(null)
    setSucesso(false)

    try {
      await salvarFuncionamentoSemanal(semana, blocos)
      const atualizados = await carregarBlocosEstabelecimento()
      setBlocos(atualizados)
      setSemana(montarSemana(atualizados))
      setConfiguracaoInicial(false)
      setSucesso(true)
    } catch (error) {
      const mensagem = mensagemErro(error)

      try {
        const atuais = await carregarBlocosEstabelecimento()
        setBlocos(atuais)
        setSemana(montarSemana(atuais))
        setConfiguracaoInicial(atuais.length === 0)
      } catch {
        // Mantem o formulario atual quando nem a recarga for possivel.
      }

      setErro(mensagem)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="config-agenda-page">
      <header className="config-agenda-header">
        <p className="servicos-kicker">Configurações</p>
        <h1>Agenda</h1>
      </header>

      <nav className="config-agenda-tabs" aria-label="Configurações da Agenda">
        <button className={aba === 'funcionamento' ? 'ativa' : ''} type="button" onClick={() => setAba('funcionamento')}>Funcionamento</button>
        <button type="button" disabled>Exceções e feriados</button>
        <button className={aba === 'taxidog' ? 'ativa' : ''} type="button" onClick={() => setAba('taxidog')}>TaxiDog</button>
        <button type="button" disabled>Regras da Agenda</button>
      </nav>

      <div className="config-agenda-conteudo">
        {aba === 'taxidog' ? <ConfiguracaoTaxidog /> : <>
        <div className="config-agenda-titulo">
          <h2>Funcionamento da loja</h2>
          {configuracaoInicial && (
            <span className="config-agenda-pendente">Ainda não configurado</span>
          )}
        </div>

        {carregando ? (
          <p className="config-agenda-mensagem">Carregando funcionamento…</p>
        ) : erro && semana.length === 0 ? (
          <div className="config-agenda-erro">
            <span>{erro}</span>
            <Button variant="secondary" onClick={() => void carregar()}>Tentar novamente</Button>
          </div>
        ) : (
          <form onSubmit={salvar}>
            <div className="funcionamento-semana">
              {semana.map((dia) => {
                const nome = dias.find((item) => item.valor === dia.diaSemana)?.nome

                return (
                  <div className={`funcionamento-dia ${dia.aberto ? 'aberto' : ''}`} key={dia.diaSemana}>
                    <strong>{nome}</strong>

                    <label className="funcionamento-status">
                      <input
                        type="checkbox"
                        checked={dia.aberto}
                        onChange={(evento) =>
                          alterarDia(dia.diaSemana, { aberto: evento.target.checked })
                        }
                      />
                      <span aria-hidden="true" />
                      {dia.aberto ? 'Aberto' : 'Fechado'}
                    </label>

                    <div className="funcionamento-horarios">
                      <Input
                        type="time"
                        disabled={!dia.aberto}
                        value={dia.inicio}
                        onChange={(evento) =>
                          alterarDia(dia.diaSemana, { inicio: evento.target.value })
                        }
                      />
                      <span>→</span>
                      <Input
                        type="time"
                        disabled={!dia.aberto}
                        value={dia.fim}
                        onChange={(evento) =>
                          alterarDia(dia.diaSemana, { fim: evento.target.value })
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {erro && <p className="config-agenda-feedback erro">{erro}</p>}
            {sucesso && <p className="config-agenda-feedback sucesso">Funcionamento salvo.</p>}

            <footer className="config-agenda-acoes">
              <Button type="submit">{salvando ? 'Salvando…' : 'Salvar funcionamento'}</Button>
            </footer>
          </form>
        )}
        </>}
      </div>
    </section>
  )
}

function mensagemErro(error: unknown) {
  return typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : 'Não foi possível salvar o funcionamento.'
}
