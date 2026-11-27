import { useContext, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import Button from './ui/Button'
import Input from './ui/Input'
import Select from './ui/Select'
import Modal from './ui/Modal'
import { SistemaContext } from '../context/SistemaContext'
import { criarTravaSubmissaoPet } from '../data/submissaoPet.ts'
import type { EspeciePet, PelagemPet, Pet, PortePet, SexoPet, TemperamentoPet } from '../types/Pet'

export default function EditorPet({ pet, fixarCliente = false, onClose, onSaved }: {
  pet?: Pet
  fixarCliente?: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const { clientes, racas, adicionarPet, atualizarPet } = useContext(SistemaContext)
  const [salvando, setSalvando] = useState(false)
  const travaSubmissao = useRef(criarTravaSubmissaoPet())

  const [clienteId, setClienteId] = useState(pet?.clienteId ?? '')
  const [nome, setNome] = useState(pet?.nome ?? '')
  const [especie, setEspecie] = useState<EspeciePet | ''>(pet?.especie ?? '')
  const [racaId, setRacaId] = useState(pet?.racaId ?? '')
  const [racaBusca, setRacaBusca] = useState(pet?.racaNome ?? '')
  const [sexo, setSexo] = useState<SexoPet | ''>(pet?.sexo ?? '')
  const [porte, setPorte] = useState<PortePet | ''>(pet?.porte ?? '')
  const [pelagem, setPelagem] = useState<PelagemPet | ''>(pet?.pelagem ?? '')
  const [peso, setPeso] = useState(pet?.peso == null ? '' : String(pet.peso))
  const [cor, setCor] = useState(pet?.cor ?? '')
  const [dataNascimento, setDataNascimento] = useState(pet?.dataNascimento ?? '')
  const [castrado, setCastrado] = useState<boolean | null>(pet?.castrado ?? null)
  const [temperamento, setTemperamento] = useState<TemperamentoPet | ''>(pet?.temperamento ?? '')
  const [observacoes, setObservacoes] = useState(pet?.observacoes ?? '')

  const racasSugeridas = useMemo(() => {
    const termo = racaBusca.trim().toLocaleLowerCase('pt-BR')
    return racas
      .filter((raca) => raca.ativo && raca.especie === especie)
      .filter((raca) => !termo || raca.nome.toLocaleLowerCase('pt-BR').includes(termo) || raca.sinonimos.some((sinonimo) => sinonimo.ativo && sinonimo.nome.toLocaleLowerCase('pt-BR').includes(termo)))
      .slice(0, 8)
  }, [racas, especie, racaBusca])

  function fecharModal() {
    if (!travaSubmissao.current.ativa()) onClose()
  }

  async function salvarPet(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (travaSubmissao.current.ativa()) return

    if (!clienteId.trim()) {
      alert('Informe o código do cliente responsável.')
      return
    }

    if (!nome.trim()) {
      alert('Preencha o nome do pet.')
      return
    }

    if (racaId && !especie) {
      alert('Informe a espécie para a raça selecionada.')
      return
    }

    const dadosPet = {
      clienteId,
      nome: nome.trim(),
      especie: especie || null,
      racaId: racaId || null,
      sexo: sexo || null,
      porte: porte || null,
      pelagem: pelagem || null,
      peso: peso ? Number(peso) : null,
      cor: cor.trim(),
      dataNascimento: dataNascimento.trim(),
      castrado,
      temperamento: temperamento || null,
      observacoes: observacoes.trim(),
    }

    setSalvando(true)
    try {
      const resultado = await travaSubmissao.current.executar(async () => {
        if (pet) await atualizarPet(pet.id, dadosPet)
        else await adicionarPet(dadosPet)
      })
      if (!resultado.executado) return
      onSaved?.()
      onClose()
    } catch (error) {
      setSalvando(false)
      alert(obterMensagemErro(error))
    }
  }

  return createPortal(
    <Modal
      aberto
      titulo={pet ? 'Editar pet' : 'Novo pet'}
      onClose={fecharModal}
    >
      <form
        onSubmit={salvarPet}
        style={{
          display: 'grid',
          gap: '14px',
        }}
      >
        <Campo titulo="Código do cliente *">
          <Select
            disabled={fixarCliente}
            value={clienteId}
            onChange={(evento) => setClienteId(evento.target.value)}
            options={[
              { value: '', label: 'Selecione o cliente' },
              ...clientes.map((cliente) => ({
                value: cliente.id,
                label: `${cliente.nome} (${cliente.id})`,
              })),
            ]}
          />
        </Campo>

        <Campo titulo="Nome do pet *">
          <Input
            placeholder="Nome do pet"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
          />
        </Campo>

        <div style={gradeDuasColunas}>
          <Campo titulo="Espécie">
            <Select
              value={especie}
              onChange={(evento) => {
                setEspecie(evento.target.value as 'cao' | 'gato')
                setRacaId('')
                setRacaBusca('')
              }}
              options={[
                { value: '', label: 'Não informado' },
                { value: 'cao', label: 'Cão' },
                { value: 'gato', label: 'Gato' },
              ]}
            />
          </Campo>

          <Campo titulo="Raça">
            <div style={{ position: 'relative' }}>
              <Input
                placeholder="Busque uma raça"
                value={racaBusca}
                onChange={(evento) => {
                  setRacaBusca(evento.target.value)
                  setRacaId('')
                }}
              />
              {!racaId && racaBusca.trim() && (
                <div style={listaAutocomplete}>
                  {racasSugeridas.map((raca) => (
                    <button
                      type="button"
                      key={raca.id}
                      style={opcaoAutocomplete}
                      onClick={() => {
                        setRacaId(raca.id)
                        setRacaBusca(raca.nome)
                      }}
                    >
                      {raca.nome}
                    </button>
                  ))}
                  {racasSugeridas.length === 0 && (
                    <span style={{ padding: '12px' }}>Nenhuma raça encontrada.</span>
                  )}
                </div>
              )}
            </div>
          </Campo>
        </div>

        <div style={gradeDuasColunas}>
          <Campo titulo="Sexo">
            <Select
              value={sexo}
              onChange={(evento) =>
                setSexo(evento.target.value as 'macho' | 'femea')
              }
              options={[
                { value: '', label: 'Não informado' },
                { value: 'macho', label: 'Macho' },
                { value: 'femea', label: 'Fêmea' },
              ]}
            />
          </Campo>

          <Campo titulo="Porte">
            <Select
              value={porte}
              onChange={(evento) =>
                setPorte(
                  evento.target.value as
                    | 'mini'
                    | 'pequeno'
                    | 'medio'
                    | 'grande'
                    | 'gigante',
                )
              }
              options={[
                { value: '', label: 'Não informado' },
                { value: 'mini', label: 'Mini' },
                { value: 'pequeno', label: 'Pequeno' },
                { value: 'medio', label: 'Médio' },
                { value: 'grande', label: 'Grande' },
                { value: 'gigante', label: 'Gigante' },
              ]}
            />
          </Campo>
        </div>

        <Campo titulo="Pelagem">
          <Select
            value={pelagem}
            onChange={(evento) => setPelagem(evento.target.value as PelagemPet | '')}
            options={[
              { value: '', label: 'Não informado' },
              { value: 'curta', label: 'Curta' },
              { value: 'media', label: 'Média' },
              { value: 'longa', label: 'Longa' },
            ]}
          />
        </Campo>

        <div style={gradeDuasColunas}>
          <Campo titulo="Peso">
            <Input
              type="number"
              placeholder="Peso em kg"
              value={peso}
              onChange={(evento) => setPeso(evento.target.value)}
            />
          </Campo>

          <Campo titulo="Cor">
            <Input
              placeholder="Cor da pelagem"
              value={cor}
              onChange={(evento) => setCor(evento.target.value)}
            />
          </Campo>
        </div>

        <Campo titulo="Data de nascimento">
          <Input
            placeholder="DD/MM/AAAA"
            value={dataNascimento}
            onChange={(evento) =>
              setDataNascimento(evento.target.value)
            }
          />
        </Campo>

        <Campo titulo="Temperamento">
          <Select
            value={temperamento}
            onChange={(evento) =>
              setTemperamento(evento.target.value as TemperamentoPet | '')
            }
            options={[
              { value: '', label: 'Não informado' },
              { value: 'calmo', label: 'Calmo' },
              { value: 'moderado', label: 'Moderado' },
              { value: 'dificil', label: 'Difícil' },
            ]}
          />
        </Campo>

        <Campo titulo="Castrado">
          <Select value={castrado === null ? '' : castrado ? 'sim' : 'nao'} onChange={(evento) => setCastrado(evento.target.value === '' ? null : evento.target.value === 'sim')} options={[{ value: '', label: 'Não informado' }, { value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }]} />
        </Campo>

        <Campo titulo="Observações">
          <textarea
            placeholder="Temperamento, alergias e informações importantes"
            value={observacoes}
            onChange={(evento) =>
              setObservacoes(evento.target.value)
            }
            style={{
              width: '100%',
              minHeight: '90px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              outline: 'none',
              fontSize: '15px',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </Campo>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px',
          }}
        >
          <Button
            variant="secondary"
            onClick={fecharModal}
            disabled={salvando}
          >
            Cancelar
          </Button>

          <Button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : pet ? 'Salvar alterações' : 'Salvar Pet'}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  )
}

function obterMensagemErro(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'Não foi possível salvar o pet. Tente novamente.'
}

type CampoProps = {
  titulo: string
  children: React.ReactNode
}

function Campo({ titulo, children }: CampoProps) {
  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <label style={{ fontWeight: 600 }}>
        {titulo}
      </label>

      {children}
    </div>
  )
}

const gradeDuasColunas = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '14px',
}

const listaAutocomplete = {
  position: 'absolute' as const,
  zIndex: 10,
  top: 'calc(100% + 6px)',
  width: '100%',
  display: 'grid',
  maxHeight: '220px',
  overflowY: 'auto' as const,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-card)',
  boxShadow: 'var(--shadow-lg)',
}

const opcaoAutocomplete = {
  padding: '11px 12px',
  textAlign: 'left' as const,
  background: 'transparent',
  color: 'var(--color-text)',
  borderBottom: '1px solid var(--color-border)',
}
