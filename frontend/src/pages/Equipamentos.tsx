import { useContext, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import { AgendaContext } from '../context/AgendaContext'
import {
  salvarEquipamento,
  salvarPerfilCapacidade,
} from '../data/configuracaoAgenda'
import type {
  Equipamento,
  EquipamentoPerfilCapacidade,
} from '../types/Agenda'
import type { Pet } from '../types/Pet'

const portes: NonNullable<Pet['porte']>[] = ['mini', 'pequeno', 'medio', 'grande', 'gigante']

export default function Equipamentos() {
  const { equipamentos, equipamentoPerfis, equipamentoPerfilItens, recarregarAgenda } =
    useContext(AgendaContext)
  const [modalEquipamento, setModalEquipamento] = useState(false)
  const [modalPerfil, setModalPerfil] = useState(false)
  const [equipamentoId, setEquipamentoId] = useState<string | null>(null)
  const [perfilId, setPerfilId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')
  const [unidades, setUnidades] = useState('1')
  const [separarSexo, setSepararSexo] = useState(false)
  const [exigeSupervisao, setExigeSupervisao] = useState(false)
  const [ativo, setAtivo] = useState(true)
  const [nomePerfil, setNomePerfil] = useState('')
  const [perfilAtivo, setPerfilAtivo] = useState(true)
  const [capacidades, setCapacidades] = useState<Record<NonNullable<Pet['porte']>, number>>({
    mini: 0, pequeno: 0, medio: 0, grande: 0, gigante: 0,
  })

  function novoEquipamento() {
    setEquipamentoId(null); setNome(''); setTipo(''); setUnidades('1')
    setSepararSexo(false); setExigeSupervisao(false); setAtivo(true); setModalEquipamento(true)
  }

  function editarEquipamento(item: Equipamento) {
    setEquipamentoId(item.id); setNome(item.nome); setTipo(item.tipo)
    setUnidades(String(item.quantidadeUnidades)); setSepararSexo(item.separarPorSexo)
    setExigeSupervisao(item.exigeSupervisaoHumana)
    setAtivo(item.ativo); setModalEquipamento(true)
  }

  function novoPerfil(id: string) {
    setEquipamentoId(id); setPerfilId(null); setNomePerfil(''); setPerfilAtivo(true)
    setCapacidades({ mini: 0, pequeno: 0, medio: 0, grande: 0, gigante: 0 })
    setModalPerfil(true)
  }

  function editarPerfil(perfil: EquipamentoPerfilCapacidade) {
    const valores = { mini: 0, pequeno: 0, medio: 0, grande: 0, gigante: 0 }
    equipamentoPerfilItens
      .filter((item) => item.perfilId === perfil.id && item.ativo)
      .forEach((item) => { valores[item.porte] = item.quantidade })
    setEquipamentoId(perfil.equipamentoId); setPerfilId(perfil.id)
    setNomePerfil(perfil.nome); setPerfilAtivo(perfil.ativo)
    setCapacidades(valores); setModalPerfil(true)
  }

  async function enviarEquipamento(evento: FormEvent) {
    evento.preventDefault()
    try {
      await salvarEquipamento({ nome: nome.trim(), tipo: tipo.trim(), quantidadeUnidades: Number(unidades), separarPorSexo: separarSexo, exigeSupervisaoHumana: exigeSupervisao, ativo }, equipamentoId ?? undefined)
      await recarregarAgenda(); setModalEquipamento(false)
    } catch (error) { alert(mensagemErro(error)) }
  }

  async function enviarPerfil(evento: FormEvent) {
    evento.preventDefault()
    if (!equipamentoId) return
    try {
      await salvarPerfilCapacidade({ equipamentoId, nome: nomePerfil.trim(), ativo: perfilAtivo, capacidades }, perfilId ?? undefined)
      await recarregarAgenda(); setModalPerfil(false)
    } catch (error) { alert(mensagemErro(error)) }
  }

  return (
    <div style={{ padding: '40px' }}>
      <Cabecalho acao={novoEquipamento} />
      <div style={{ display: 'grid', gap: '16px' }}>
        {equipamentos.map((equipamento) => (
          <Card key={equipamento.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <div><strong>{equipamento.nome}</strong><p style={secundario}>{equipamento.quantidadeUnidades} unidades • {equipamento.separarPorSexo ? 'separação por sexo' : 'sem separação por sexo'} • {equipamento.exigeSupervisaoHumana ? 'exige supervisão durante o uso' : 'não exige supervisão'} • {equipamento.ativo ? 'Ativo' : 'Inativo'}</p></div>
              <Button variant="secondary" onClick={() => editarEquipamento(equipamento)}>Editar</Button>
            </div>
            <div style={{ display: 'grid', gap: '8px', marginTop: '16px' }}>
              {equipamentoPerfis.filter((perfil) => perfil.equipamentoId === equipamento.id).map((perfil) => (
                <button key={perfil.id} onClick={() => editarPerfil(perfil)} style={linhaBotao}>{perfil.nome} • {perfil.ativo ? 'Ativo' : 'Inativo'}</button>
              ))}
              <Button variant="secondary" onClick={() => novoPerfil(equipamento.id)}>+ Perfil de capacidade</Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal aberto={modalEquipamento} titulo={equipamentoId ? 'Editar equipamento' : 'Novo equipamento'} onClose={() => setModalEquipamento(false)}>
        <form onSubmit={enviarEquipamento} style={formulario}>
          <Campo titulo="Nome"><Input value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <Campo titulo="Tipo"><Input value={tipo} onChange={(e) => setTipo(e.target.value)} /></Campo>
          <Campo titulo="Quantidade de unidades"><Input type="number" value={unidades} onChange={(e) => setUnidades(e.target.value)} /></Campo>
          <Check texto="Separar machos e fêmeas" valor={separarSexo} alterar={setSepararSexo} />
          <Check texto="Exigir supervisão humana durante todo o uso" valor={exigeSupervisao} alterar={setExigeSupervisao} />
          <Check texto="Equipamento ativo" valor={ativo} alterar={setAtivo} />
          <Button type="submit">Salvar</Button>
        </form>
      </Modal>

      <Modal aberto={modalPerfil} titulo={perfilId ? 'Editar perfil' : 'Novo perfil'} onClose={() => setModalPerfil(false)}>
        <form onSubmit={enviarPerfil} style={formulario}>
          <Campo titulo="Nome do perfil"><Input value={nomePerfil} onChange={(e) => setNomePerfil(e.target.value)} /></Campo>
          {portes.map((porte) => <Campo key={porte} titulo={`Capacidade: ${porte}`}><Input type="number" value={String(capacidades[porte])} onChange={(e) => setCapacidades((atual) => ({ ...atual, [porte]: Number(e.target.value) }))} /></Campo>)}
          <Check texto="Perfil ativo" valor={perfilAtivo} alterar={setPerfilAtivo} />
          <Button type="submit">Salvar perfil</Button>
        </form>
      </Modal>
    </div>
  )
}

function Cabecalho({ acao }: { acao: () => void }) { return <div style={cabecalho}><div><h1 style={{ margin: 0, lineHeight: 1.15 }}>⚙️ Equipamentos</h1><p style={secundario}>Configure unidades e perfis de capacidade simultânea.</p></div><Button onClick={acao}>+ Novo Equipamento</Button></div> }
function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <label style={{ display: 'grid', gap: '6px' }}><strong>{titulo}</strong>{children}</label> }
function Check({ texto, valor, alterar }: { texto: string; valor: boolean; alterar: (valor: boolean) => void }) { return <label><input type="checkbox" checked={valor} onChange={(e) => alterar(e.target.checked)} /> {texto}</label> }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível salvar.' }
const formulario = { display: 'grid', gap: '14px' }
const secundario = { margin: '8px 0 0', color: 'var(--color-text-muted)' }
const cabecalho = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', marginBottom: '24px' }
const linhaBotao = { padding: '10px', textAlign: 'left' as const, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-muted)', color: 'var(--color-text)' }
