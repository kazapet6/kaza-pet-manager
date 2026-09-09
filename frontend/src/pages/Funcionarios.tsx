import { useContext, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { AgendaContext } from '../context/AgendaContext'
import {
  configurarFuncionarioEtapa,
  salvarFuncionario,
  salvarJornadaSemanal,
  type DiaJornada,
} from '../data/configuracaoAgenda'
import type { Funcionario } from '../types/Agenda'

const dias = [
  { valor: 1, nome: 'Segunda-feira' },
  { valor: 2, nome: 'Terça-feira' },
  { valor: 3, nome: 'Quarta-feira' },
  { valor: 4, nome: 'Quinta-feira' },
  { valor: 5, nome: 'Sexta-feira' },
  { valor: 6, nome: 'Sábado' },
  { valor: 0, nome: 'Domingo' },
]

function semanaVazia(): DiaJornada[] {
  return dias.map((dia) => ({
    diaSemana: dia.valor,
    trabalha: false,
    inicio: '09:00',
    fim: '18:00',
    possuiIntervalo: false,
    intervaloInicio: '12:00',
    intervaloFim: '13:00',
  }))
}

export default function Funcionarios() {
  const agenda = useContext(AgendaContext)
  const [modalFuncionario, setModalFuncionario] = useState(false)
  const [modalEtapas, setModalEtapas] = useState(false)
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [semana, setSemana] = useState<DiaJornada[]>(semanaVazia)

  function novo() {
    setFuncionarioId(null)
    setNome('')
    setAtivo(true)
    setSemana(semanaVazia())
    setModalFuncionario(true)
  }

  function editar(item: Funcionario) {
    setFuncionarioId(item.id)
    setNome(item.nome)
    setAtivo(item.ativo)
    setSemana(
      dias.map((dia) => {
        const jornada = agenda.funcionarioJornadas.find(
          (itemJornada) =>
            itemJornada.funcionarioId === item.id &&
            itemJornada.diaSemana === dia.valor,
        )
        const intervalo = agenda.funcionarioIntervalos.find(
          (itemIntervalo) =>
            itemIntervalo.funcionarioId === item.id &&
            itemIntervalo.diaSemana === dia.valor,
        )

        return {
          diaSemana: dia.valor,
          trabalha: jornada?.ativo ?? false,
          inicio: jornada?.inicio ?? '09:00',
          fim: jornada?.fim ?? '18:00',
          possuiIntervalo: intervalo?.ativo ?? false,
          intervaloInicio: intervalo?.inicio ?? '12:00',
          intervaloFim: intervalo?.fim ?? '13:00',
        }
      }),
    )
    setModalFuncionario(true)
  }

  function alterarDia(diaSemana: number, alteracao: Partial<DiaJornada>) {
    setSemana((atual) =>
      atual.map((dia) =>
        dia.diaSemana === diaSemana ? { ...dia, ...alteracao } : dia,
      ),
    )
  }

  async function enviarFuncionario(evento: FormEvent) {
    evento.preventDefault()

    try {
      const id = await salvarFuncionario(
        { nome: nome.trim(), ativo },
        funcionarioId ?? undefined,
      )
      await salvarJornadaSemanal(id, semana)
      await agenda.recarregarAgenda()
      setFuncionarioId(id)
      setModalFuncionario(false)
    } catch (error) {
      alert(mensagemErro(error))
    }
  }

  async function alternarEtapa(etapaId: string, habilitada: boolean) {
    if (!funcionarioId) return
    try {
      await configurarFuncionarioEtapa(funcionarioId, etapaId, !habilitada)
      await agenda.recarregarAgenda()
    } catch (error) {
      alert(mensagemErro(error))
    }
  }

  async function alternarServico(servicoId:string,habilitado:boolean){
    if(!funcionarioId)return
    const etapas=agenda.servicoEtapas.filter(e=>e.servicoId===servicoId&&e.recurso==='funcionario')
    try{for(const etapa of etapas){const atual=agenda.funcionarioEtapas.some(x=>x.funcionarioId===funcionarioId&&x.servicoEtapaId===etapa.id&&x.ativo);if(atual!==habilitado)await configurarFuncionarioEtapa(funcionarioId,etapa.id,habilitado)}await agenda.recarregarAgenda()}catch(error){alert(mensagemErro(error))}
  }

  return (
    <div style={{ padding: '40px' }}>
      <div style={cabecalho}>
        <div>
          <h1 style={{ margin: 0, lineHeight: 1.15 }}>👤 Funcionários</h1>
          <p style={secundario}>Configure a jornada semanal e as etapas executáveis.</p>
        </div>
        <Button onClick={novo}>+ Novo Funcionário</Button>
      </div>

      <div style={{ display: 'grid', gap: '16px' }}>
        {agenda.funcionarios.map((funcionario) => {
          const diasAtivos = agenda.funcionarioJornadas.filter(
            (jornada) => jornada.funcionarioId === funcionario.id && jornada.ativo,
          ).length
          return (
            <Card key={funcionario.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <strong>{funcionario.nome}</strong>
                  <p style={secundario}>{funcionario.ativo ? 'Ativo' : 'Inativo'} • {diasAtivos} dias de trabalho</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button variant="secondary" onClick={() => editar(funcionario)}>Editar</Button>
                  <Button variant="secondary" onClick={() => { setFuncionarioId(funcionario.id); setModalEtapas(true) }}>Serviços</Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        aberto={modalFuncionario}
        titulo={funcionarioId ? 'Editar funcionário' : 'Novo funcionário'}
        onClose={() => setModalFuncionario(false)}
      >
        <form onSubmit={enviarFuncionario} style={formulario}>
          <Campo titulo="Nome">
            <Input value={nome} onChange={(evento) => setNome(evento.target.value)} />
          </Campo>
          <Check texto="Funcionário ativo" valor={ativo} alterar={setAtivo} />

          <div>
            <h3 style={{ margin: '8px 0 12px' }}>Jornada semanal</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              {semana.map((dia) => {
                const nomeDia = dias.find((item) => item.valor === dia.diaSemana)?.nome
                return (
                  <Card key={dia.diaSemana} style={{ padding: '16px' }}>
                    <strong>{nomeDia}</strong>
                    <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                      <Check texto="Trabalha nesse dia" valor={dia.trabalha} alterar={(valor) => alterarDia(dia.diaSemana, { trabalha: valor })} />
                      <div style={duasColunas}>
                        <Campo titulo="Início"><Input type="time" disabled={!dia.trabalha} value={dia.inicio} onChange={(e) => alterarDia(dia.diaSemana, { inicio: e.target.value })} /></Campo>
                        <Campo titulo="Fim"><Input type="time" disabled={!dia.trabalha} value={dia.fim} onChange={(e) => alterarDia(dia.diaSemana, { fim: e.target.value })} /></Campo>
                      </div>
                      <Check texto="Possui intervalo" valor={dia.possuiIntervalo} disabled={!dia.trabalha} alterar={(valor) => alterarDia(dia.diaSemana, { possuiIntervalo: valor })} />
                      <div style={duasColunas}>
                        <Campo titulo="Início do intervalo"><Input type="time" disabled={!dia.trabalha || !dia.possuiIntervalo} value={dia.intervaloInicio} onChange={(e) => alterarDia(dia.diaSemana, { intervaloInicio: e.target.value })} /></Campo>
                        <Campo titulo="Fim do intervalo"><Input type="time" disabled={!dia.trabalha || !dia.possuiIntervalo} value={dia.intervaloFim} onChange={(e) => alterarDia(dia.diaSemana, { intervaloFim: e.target.value })} /></Campo>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          <Button type="submit">Salvar funcionário e jornada</Button>
        </form>
      </Modal>

      <Modal aberto={modalEtapas} titulo="Serviços que este funcionário executa" onClose={() => setModalEtapas(false)}>
        <div style={{ display: 'grid', gap: '10px' }}>
          {agenda.servicos.filter(servico=>agenda.servicoEtapas.some(e=>e.servicoId===servico.id&&e.recurso==='funcionario')).map(servico=>{const etapas=agenda.servicoEtapas.filter(e=>e.servicoId===servico.id&&e.recurso==='funcionario');const marcada=etapas.length>0&&etapas.every(etapa=>agenda.funcionarioEtapas.some(item=>item.funcionarioId===funcionarioId&&item.servicoEtapaId===etapa.id&&item.ativo));return <label key={servico.id} style={linhaBotao}><input type="checkbox" checked={marcada} onChange={()=>void alternarServico(servico.id,!marcada)}/> <strong>{servico.nome}</strong><small style={{display:'block',marginLeft:'22px',color:'var(--color-text-muted)'}}>{marcada?'Habilitado para todas as etapas com equipe':'Não conta como capacidade para este Serviço'}</small></label>})}
          <details><summary>Configuração avançada por etapa</summary><div style={{display:'grid',gap:'8px',marginTop:'10px'}}>{agenda.servicoEtapas.filter((etapa) => etapa.recurso === 'funcionario').map((etapa) => {const marcada = agenda.funcionarioEtapas.some((item) => item.funcionarioId === funcionarioId && item.servicoEtapaId === etapa.id && item.ativo);const servico = agenda.servicos.find((item) => item.id === etapa.servicoId);return <label key={etapa.id} style={linhaBotao}><input type="checkbox" checked={marcada} onChange={() => void alternarEtapa(etapa.id, marcada)} /> {servico?.nome} — {etapa.nome}</label>})}</div></details>
        </div>
      </Modal>
    </div>
  )
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <label style={{ display: 'grid', gap: '6px' }}><strong>{titulo}</strong>{children}</label> }
function Check({ texto, valor, alterar, disabled = false }: { texto: string; valor: boolean; alterar: (valor: boolean) => void; disabled?: boolean }) { return <label><input type="checkbox" checked={valor} disabled={disabled} onChange={(e) => alterar(e.target.checked)} /> {texto}</label> }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível salvar.' }
const formulario = { display: 'grid', gap: '16px' }
const secundario = { margin: '8px 0 0', color: 'var(--color-text-muted)' }
const cabecalho = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', marginBottom: '24px' }
const duasColunas = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }
const linhaBotao = { padding: '10px', textAlign: 'left' as const, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-muted)', color: 'var(--color-text)' }
