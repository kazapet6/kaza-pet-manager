import { useContext, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { AgendaContext } from '../context/AgendaContext'
import { salvarCicloTaxidog, validarCicloTaxidog, type DadosCicloTaxidog } from '../data/taxidog'
import type { TaxidogCiclo } from '../types/Agenda'

const dias = [
  { valor: 1, curto: 'Seg', nome: 'Segunda' },
  { valor: 2, curto: 'Ter', nome: 'Terça' },
  { valor: 3, curto: 'Qua', nome: 'Quarta' },
  { valor: 4, curto: 'Qui', nome: 'Quinta' },
  { valor: 5, curto: 'Sex', nome: 'Sexta' },
  { valor: 6, curto: 'Sáb', nome: 'Sábado' },
  { valor: 0, curto: 'Dom', nome: 'Domingo' },
]

const vazio: DadosCicloTaxidog = { nome: '', ordem: 1, coletaInicio: '', coletaFim: '', conclusaoLimite: '', ativo: true, diasSemana: [] }
const sugestoes: DadosCicloTaxidog[] = [
  { nome: 'Ciclo da manhã', ordem: 1, coletaInicio: '08:00', coletaFim: '09:00', conclusaoLimite: '13:00', ativo: true, diasSemana: [2, 3, 4, 5, 6] },
  { nome: 'Ciclo da tarde', ordem: 2, coletaInicio: '13:00', coletaFim: '14:00', conclusaoLimite: '', ativo: true, diasSemana: [2, 3, 4, 5, 6] },
]

export default function ConfiguracaoTaxidog() {
  const agenda = useContext(AgendaContext)
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | undefined>()
  const [formulario, setFormulario] = useState<DadosCicloTaxidog>(vazio)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const ciclos = [...agenda.taxidogCiclos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))

  function novo(sugestao?: DadosCicloTaxidog) {
    setEditandoId(undefined)
    setFormulario({ ...(sugestao ?? vazio), diasSemana: [...(sugestao?.diasSemana ?? [])] })
    setErro(null)
    setAberto(true)
  }

  function editar(ciclo: TaxidogCiclo) {
    setEditandoId(ciclo.id)
    setFormulario({
      nome: ciclo.nome,
      ordem: ciclo.ordem,
      coletaInicio: ciclo.coletaInicio.slice(0, 5),
      coletaFim: ciclo.coletaFim.slice(0, 5),
      conclusaoLimite: ciclo.conclusaoLimite.slice(0, 5),
      ativo: ciclo.ativo,
      diasSemana: agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dia.diaSemana),
    })
    setErro(null)
    setAberto(true)
  }

  function alterar(alteracao: Partial<DadosCicloTaxidog>) {
    setFormulario((atual) => ({ ...atual, ...alteracao }))
    setErro(null)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    const validacao = validarCicloTaxidog(formulario)
    if (validacao) return setErro(validacao)
    setSalvando(true)
    setErro(null)
    setSucesso(null)
    try {
      await salvarCicloTaxidog(formulario, editandoId)
      await agenda.recarregarAgenda()
      setAberto(false)
      setSucesso(editandoId ? 'Ciclo atualizado.' : 'Ciclo criado.')
    } catch (error) {
      setErro(mensagemErro(error))
      await agenda.recarregarAgenda().catch(() => undefined)
    } finally {
      setSalvando(false)
    }
  }

  return <>
    <div className="config-agenda-titulo">
      <div><h2>Ciclos do TaxiDog</h2><p className="taxidog-descricao">Configure coleta, limite de conclusão e dias de funcionamento de cada ciclo.</p></div>
      <Button onClick={() => novo()}>+ Novo ciclo</Button>
    </div>
    {sucesso && <p className="config-agenda-feedback sucesso">{sucesso}</p>}
    {agenda.carregandoAgenda ? <p className="config-agenda-mensagem">Carregando ciclos…</p> : ciclos.length ? <div className="taxidog-ciclos">
      {ciclos.map((ciclo) => {
        const diasAtivos = agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dias.find((item) => item.valor === dia.diaSemana)?.curto).filter(Boolean)
        return <button className="taxidog-ciclo-card" type="button" key={ciclo.id} onClick={() => editar(ciclo)}>
          <span className="taxidog-ciclo-topo"><strong>{ciclo.nome}</strong><span className={ciclo.ativo ? 'ativo' : 'inativo'}>{ciclo.ativo ? 'Ativo' : 'Inativo'}</span></span>
          <span className="taxidog-ciclo-ordem">Ciclo {ciclo.ordem}</span>
          <span className="taxidog-ciclo-horarios"><span><small>Coleta</small>{hora(ciclo.coletaInicio)} → {hora(ciclo.coletaFim)}</span><span><small>Pets prontos até</small>{hora(ciclo.conclusaoLimite)}</span></span>
          <span className="taxidog-ciclo-dias">{diasAtivos.length ? diasAtivos.join(' · ') : 'Nenhum dia ativo'}</span>
        </button>
      })}
    </div> : <div className="taxidog-vazio">
      <h3>Nenhum ciclo configurado</h3><p>As sugestões abaixo não são salvas automaticamente.</p>
      <div>{sugestoes.map((item) => <button type="button" key={item.nome} onClick={() => novo(item)}><strong>{item.nome}</strong><span>{item.coletaInicio} → {item.coletaFim}</span><small>{item.conclusaoLimite ? `Pets prontos até ${item.conclusaoLimite}` : 'Defina o limite antes de salvar'}</small></button>)}</div>
    </div>}

    <Modal aberto={aberto} titulo={editandoId ? 'Editar ciclo TaxiDog' : 'Novo ciclo TaxiDog'} onClose={() => setAberto(false)}>
      <form className="taxidog-form" onSubmit={salvar}>
        <div className="form-grid"><label><strong>Nome do ciclo</strong><Input value={formulario.nome} onChange={(e) => alterar({ nome: e.target.value })} /></label><label><strong>Ordem</strong><Input type="number" value={String(formulario.ordem)} onChange={(e) => alterar({ ordem: Number(e.target.value) })} /></label></div>
        <fieldset><legend>Janela de coleta</legend><div className="taxidog-horas"><Input type="time" value={formulario.coletaInicio} onChange={(e) => alterar({ coletaInicio: e.target.value })} /><span>→</span><Input type="time" value={formulario.coletaFim} onChange={(e) => alterar({ coletaFim: e.target.value })} /></div><small>O início operacional mais cedo será o fim desta janela.</small></fieldset>
        <label><strong>Pets precisam estar prontos até</strong><Input type="time" value={formulario.conclusaoLimite} onChange={(e) => alterar({ conclusaoLimite: e.target.value })} /></label>
        <fieldset><legend>Dias de funcionamento</legend><div className="taxidog-dias-selecao">{dias.map((dia) => <label key={dia.valor} title={dia.nome}><input type="checkbox" checked={formulario.diasSemana.includes(dia.valor)} onChange={() => alterar({ diasSemana: formulario.diasSemana.includes(dia.valor) ? formulario.diasSemana.filter((item) => item !== dia.valor) : [...formulario.diasSemana, dia.valor] })} /><span>{dia.curto}</span></label>)}</div></fieldset>
        <label className="taxidog-ativo"><input type="checkbox" checked={formulario.ativo} onChange={(e) => alterar({ ativo: e.target.checked })} /> Ciclo ativo</label>
        {erro && <p className="config-agenda-feedback erro">{erro}</p>}
        <footer className="config-agenda-acoes"><Button type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar ciclo'}</Button></footer>
      </form>
    </Modal>
  </>
}

function hora(valor: string) { return valor.slice(0, 5) }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível salvar o ciclo.' }
