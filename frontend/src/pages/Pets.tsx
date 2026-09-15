import { useContext, useMemo, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import { SistemaContext } from '../context/SistemaContext'
import type { EspeciePet, PelagemPet, Pet, PortePet, SexoPet, TemperamentoPet } from '../types/Pet'

export default function Pets() {
  const { clientes, pets, racas, adicionarPet, atualizarPet } =
    useContext(SistemaContext)
  const [modalAberto, setModalAberto] = useState(false)
  const [petEmEdicaoId, setPetEmEdicaoId] = useState<string | null>(null)
  const [petSelecionadoId, setPetSelecionadoId] = useState<string | null>(null)
  const [tutorExpandido, setTutorExpandido] = useState(false)
  const [pesquisa, setPesquisa] = useState('')

  const [clienteId, setClienteId] = useState('')
  const [nome, setNome] = useState('')
  const [especie, setEspecie] = useState<EspeciePet | ''>('')
  const [racaId, setRacaId] = useState('')
  const [racaBusca, setRacaBusca] = useState('')
  const [sexo, setSexo] = useState<SexoPet | ''>('')
  const [porte, setPorte] = useState<PortePet | ''>('')
  const [pelagem, setPelagem] = useState<PelagemPet | ''>('')
  const [peso, setPeso] = useState('')
  const [cor, setCor] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [castrado, setCastrado] = useState<boolean | null>(null)
  const [temperamento, setTemperamento] = useState<TemperamentoPet | ''>('')
  const [observacoes, setObservacoes] = useState('')

  const petsFiltrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase()

    if (!termo) {
      return pets
    }

    return pets.filter((pet) => {
      return (
        pet.nome.toLowerCase().includes(termo) ||
        (pet.racaNome ?? '').toLowerCase().includes(termo) ||
        pet.id.toLowerCase().includes(termo) ||
        pet.clienteId.toLowerCase().includes(termo)
      )
    })
  }, [pets, pesquisa])

  const racasSugeridas = useMemo(() => {
    const termo = racaBusca.trim().toLocaleLowerCase('pt-BR')
    return racas
      .filter((raca) => raca.ativo && raca.especie === especie)
      .filter((raca) => !termo || raca.nome.toLocaleLowerCase('pt-BR').includes(termo) || raca.sinonimos.some((sinonimo) => sinonimo.ativo && sinonimo.nome.toLocaleLowerCase('pt-BR').includes(termo)))
      .slice(0, 8)
  }, [racas, especie, racaBusca])

  const petSelecionado = pets.find((pet) => pet.id === petSelecionadoId)
  const tutorDoPet = petSelecionado
    ? clientes.find((cliente) => cliente.id === petSelecionado.clienteId)
    : undefined

  function abrirModal() {
    setPetEmEdicaoId(null)
    limparFormulario()
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    setPetEmEdicaoId(null)
    limparFormulario()
  }

  function editarPet(pet: Pet) {
    setClienteId(pet.clienteId)
    setNome(pet.nome)
    setEspecie(pet.especie ?? '')
    setRacaId(pet.racaId ?? '')
    setRacaBusca(pet.racaNome ?? '')
    setSexo(pet.sexo ?? '')
    setPorte(pet.porte ?? '')
    setPelagem(pet.pelagem ?? '')
    setPeso(pet.peso === null ? '' : String(pet.peso))
    setCor(pet.cor)
    setDataNascimento(pet.dataNascimento)
    setCastrado(pet.castrado)
    setTemperamento(pet.temperamento ?? '')
    setObservacoes(pet.observacoes)
    setPetEmEdicaoId(pet.id)
    setPetSelecionadoId(null)
    setTutorExpandido(false)
    setModalAberto(true)
  }

  function abrirDetalhesDoPet(id: string) {
    setPetSelecionadoId(id)
    setTutorExpandido(false)
  }

  function fecharDetalhesDoPet() {
    setPetSelecionadoId(null)
    setTutorExpandido(false)
  }

  function limparFormulario() {
    setClienteId('')
    setNome('')
    setEspecie('')
    setRacaId('')
    setRacaBusca('')
    setSexo('')
    setPorte('')
    setPelagem('')
    setPeso('')
    setCor('')
    setDataNascimento('')
    setCastrado(null)
    setTemperamento('')
    setObservacoes('')
  }

  async function salvarPet(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

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

    try {
      if (petEmEdicaoId) {
        await atualizarPet(petEmEdicaoId, dadosPet)
      } else {
        await adicionarPet(dadosPet)
      }

      fecharModal()
    } catch (error) {
      alert(obterMensagemErro(error))
    }
  }

  return (
    <div style={{ padding: '40px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'grid', gap: '10px' }}>
          <h1 style={{ margin: 0, lineHeight: 1.15 }}>🐶 Pets</h1>

          <p
            style={{
              margin: 0,
              lineHeight: 1.5,
              color: 'var(--color-text-muted)',
            }}
          >
            Gerencie todos os pets cadastrados.
          </p>
        </div>

        <Button onClick={abrirModal}>
          + Novo Pet
        </Button>
      </div>

      <Input
        placeholder="🔍 Pesquisar por nome, raça, cliente ou código..."
        value={pesquisa}
        onChange={(evento) => setPesquisa(evento.target.value)}
      />

      {petsFiltrados.length === 0 ? (
        <Card
          style={{
            padding: '48px',
            textAlign: 'center',
            border: '1px dashed var(--color-border)',
            background: 'var(--color-surface-muted)',
            marginTop: '24px',
          }}
        >
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>
            🐾
          </div>

          <strong style={{ fontSize: '18px' }}>
            {pets.length === 0
              ? 'Nenhum pet cadastrado'
              : 'Nenhum pet encontrado'}
          </strong>

          <p
            style={{
              margin: '8px 0 0',
              color: 'var(--color-text-muted)',
            }}
          >
            {pets.length === 0
              ? 'Cadastre o primeiro pet para começar.'
              : 'Tente pesquisar usando outro termo.'}
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '16px',
            marginTop: '24px',
          }}
        >
          {petsFiltrados.map((pet) => (
            <div
              key={pet.id}
              role="button"
              tabIndex={0}
              onClick={() => abrirDetalhesDoPet(pet.id)}
              onKeyDown={(evento) => {
                if (
                  evento.target === evento.currentTarget &&
                  (evento.key === 'Enter' || evento.key === ' ')
                ) {
                  evento.preventDefault()
                  abrirDetalhesDoPet(pet.id)
                }
              }}
              style={{ cursor: 'pointer' }}
            >
            <Card>
              <span
                style={{
                  color: 'var(--color-primary)',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                {pet.id}
              </span>

              <h2 style={{ margin: '10px 0 6px' }}>
                {pet.especie === 'cao' ? '🐶' : pet.especie === 'gato' ? '🐱' : '🐾'} {pet.nome}
              </h2>

              <p style={{ margin: '4px 0' }}>
                {pet.racaNome ?? 'Raça não informada'} • {formatarPorte(pet.porte)}
              </p>

              {cadastroIncompleto(pet) && <p style={{ margin: '8px 0', color: 'var(--color-warning, #9a6700)', fontWeight: 700 }}>Cadastro incompleto</p>}

              <p
                style={{
                  margin: '4px 0',
                  color: 'var(--color-text-muted)',
                }}
              >
                Tutor: {pet.clienteId}
              </p>

              <p
                style={{
                  margin: '4px 0 16px',
                  color: 'var(--color-text-muted)',
                }}
              >
                {pet.peso !== null
                  ? `${pet.peso} kg`
                  : 'Peso não informado'}
              </p>

              <div onClick={(evento) => evento.stopPropagation()}>
                <Button
                  variant="secondary"
                  onClick={() => editarPet(pet)}
                >
                  Editar
                </Button>
              </div>
            </Card>
            </div>
          ))}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo={petEmEdicaoId ? 'Editar pet' : 'Novo pet'}
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
            >
              Cancelar
            </Button>

            <Button type="submit">
              {petEmEdicaoId ? 'Salvar alterações' : 'Salvar Pet'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        aberto={Boolean(petSelecionado)}
        titulo="Detalhes do pet"
        onClose={fecharDetalhesDoPet}
      >
        {petSelecionado && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '16px',
              }}
            >
              <Detalhe titulo="Código" valor={petSelecionado.id} />
              <Detalhe titulo="Nome" valor={petSelecionado.nome} />
              <Detalhe
                titulo="Espécie"
                valor={petSelecionado.especie === 'cao' ? 'Cão' : petSelecionado.especie === 'gato' ? 'Gato' : 'Não informado'}
              />
              <Detalhe titulo="Raça" valor={petSelecionado.racaNome ?? 'Não informado'} />
              <Detalhe
                titulo="Sexo"
                valor={petSelecionado.sexo === 'macho' ? 'Macho' : petSelecionado.sexo === 'femea' ? 'Fêmea' : 'Não informado'}
              />
              <Detalhe
                titulo="Porte"
                valor={formatarPorte(petSelecionado.porte)}
              />
              <Detalhe titulo="Pelagem" valor={formatarPelagem(petSelecionado.pelagem)} />
              <Detalhe
                titulo="Peso"
                valor={
                  petSelecionado.peso === null
                    ? ''
                    : `${petSelecionado.peso} kg`
                }
              />
              <Detalhe titulo="Cor" valor={petSelecionado.cor} />
              <Detalhe
                titulo="Data de nascimento"
                valor={petSelecionado.dataNascimento}
              />
              <Detalhe
                titulo="Castrado"
                valor={petSelecionado.castrado === null ? 'Não informado' : petSelecionado.castrado ? 'Sim' : 'Não'}
              />
              <Detalhe
                titulo="Temperamento"
                valor={formatarTemperamento(petSelecionado.temperamento)}
              />
              <Detalhe
                titulo="Data de cadastro"
                valor={formatarDataCadastro(petSelecionado.criadoEm)}
              />
            </div>

            <Detalhe
              titulo="Observações"
              valor={petSelecionado.observacoes}
            />

            <div>
              <strong>Tutor</strong>

              {tutorDoPet ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setTutorExpandido((valor) => !valor)}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter' || evento.key === ' ') {
                      evento.preventDefault()
                      setTutorExpandido((valor) => !valor)
                    }
                  }}
                  style={{ cursor: 'pointer', marginTop: '12px' }}
                >
                  <Card style={{ padding: '16px' }}>
                    <strong>{tutorDoPet.nome}</strong>
                    <p
                      style={{
                        margin: '6px 0 0',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {tutorDoPet.id} • {tutorDoPet.whatsapp}
                    </p>

                    {tutorExpandido && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(2, minmax(0, 1fr))',
                          gap: '12px',
                          marginTop: '16px',
                        }}
                      >
                        <Detalhe
                          titulo="Endereço"
                          valor={tutorDoPet.endereco}
                        />
                        <Detalhe titulo="Bairro" valor={tutorDoPet.bairro} />
                        <Detalhe titulo="Cidade" valor={tutorDoPet.cidade} />
                        <Detalhe
                          titulo="Observações"
                          valor={tutorDoPet.observacoes}
                        />
                      </div>
                    )}

                    <small
                      style={{
                        display: 'block',
                        marginTop: '12px',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {tutorExpandido
                        ? 'Ocultar informações'
                        : 'Ver informações do responsável'}
                    </small>
                  </Card>
                </div>
              ) : (
                <p
                  style={{
                    margin: '10px 0 0',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  Responsável não encontrado.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

type DetalheProps = {
  titulo: string
  valor: string
}

function Detalhe({ titulo, valor }: DetalheProps) {
  return (
    <div>
      <small
        style={{
          display: 'block',
          marginBottom: '4px',
          color: 'var(--color-text-muted)',
        }}
      >
        {titulo}
      </small>
      <span>{valor || 'Não informado'}</span>
    </div>
  )
}

function formatarPorte(porte: Pet['porte']) {
  if (!porte) return 'Não informado'
  const nomes = {
    mini: 'Mini',
    pequeno: 'Pequeno',
    medio: 'Médio',
    grande: 'Grande',
    gigante: 'Gigante',
  }

  return nomes[porte]
}

function formatarTemperamento(temperamento: Pet['temperamento']) {
  if (!temperamento) return 'Não informado'
  const nomes = {
    calmo: 'Calmo',
    moderado: 'Moderado',
    dificil: 'Difícil',
  }

  return nomes[temperamento]
}

function formatarPelagem(pelagem: Pet['pelagem']) {
  if (!pelagem) return 'Não informado'
  return { curta: 'Curta', media: 'Média', longa: 'Longa' }[pelagem]
}

function cadastroIncompleto(pet: Pet) {
  return [pet.especie, pet.racaId, pet.sexo, pet.porte, pet.pelagem, pet.temperamento, pet.castrado].some((valor) => valor === null)
}

function formatarDataCadastro(valor: string) {
  const data = new Date(valor)

  return Number.isNaN(data.getTime())
    ? 'Não informado'
    : data.toLocaleDateString('pt-BR')
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
