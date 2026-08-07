import { useMemo, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import type { Pet } from '../types/Pet'

export default function Pets() {
  const [pets, setPets] = useState<Pet[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [pesquisa, setPesquisa] = useState('')

  const [clienteId, setClienteId] = useState('')
  const [nome, setNome] = useState('')
  const [especie, setEspecie] = useState<'cao' | 'gato'>('cao')
  const [raca, setRaca] = useState('')
  const [sexo, setSexo] = useState<'macho' | 'femea'>('macho')
  const [porte, setPorte] = useState<
    'mini' | 'pequeno' | 'medio' | 'grande' | 'gigante'
  >('pequeno')
  const [peso, setPeso] = useState('')
  const [cor, setCor] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [castrado, setCastrado] = useState(false)
  const [observacoes, setObservacoes] = useState('')

  const petsFiltrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase()

    if (!termo) {
      return pets
    }

    return pets.filter((pet) => {
      return (
        pet.nome.toLowerCase().includes(termo) ||
        pet.raca.toLowerCase().includes(termo) ||
        pet.id.toLowerCase().includes(termo) ||
        pet.clienteId.toLowerCase().includes(termo)
      )
    })
  }, [pets, pesquisa])

  function abrirModal() {
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    limparFormulario()
  }

  function limparFormulario() {
    setClienteId('')
    setNome('')
    setEspecie('cao')
    setRaca('')
    setSexo('macho')
    setPorte('pequeno')
    setPeso('')
    setCor('')
    setDataNascimento('')
    setCastrado(false)
    setObservacoes('')
  }

  function gerarProximoId() {
    const maiorNumero = pets.reduce((maior, pet) => {
      const numero = Number(pet.id.replace('PET-', ''))
      return numero > maior ? numero : maior
    }, 0)

    return `PET-${String(maiorNumero + 1).padStart(6, '0')}`
  }

  function salvarPet(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (!clienteId.trim()) {
      alert('Informe o código do cliente responsável.')
      return
    }

    if (!nome.trim()) {
      alert('Preencha o nome do pet.')
      return
    }

    if (!raca.trim()) {
      alert('Preencha a raça do pet.')
      return
    }

    const novoPet: Pet = {
      id: gerarProximoId(),
      clienteId: clienteId.trim().toUpperCase(),
      nome: nome.trim(),
      especie,
      raca: raca.trim(),
      sexo,
      porte,
      peso: peso ? Number(peso) : null,
      cor: cor.trim(),
      dataNascimento: dataNascimento.trim(),
      castrado,
      observacoes: observacoes.trim(),
      criadoEm: new Date().toISOString(),
    }

    setPets((petsAtuais) => [...petsAtuais, novoPet])
    fecharModal()
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
        <div>
          <h1 style={{ margin: 0 }}>🐶 Pets</h1>

          <p
            style={{
              margin: '6px 0 0',
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
            <Card key={pet.id}>
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
                {pet.especie === 'cao' ? '🐶' : '🐱'} {pet.nome}
              </h2>

              <p style={{ margin: '4px 0' }}>
                {pet.raca} • {pet.porte}
              </p>

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

              <Button variant="secondary">
                Ver pet
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo="Novo pet"
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
            <Input
              placeholder="Exemplo: CLI-000001"
              value={clienteId}
              onChange={(evento) => setClienteId(evento.target.value)}
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
                onChange={(evento) =>
                  setEspecie(evento.target.value as 'cao' | 'gato')
                }
                options={[
                  { value: 'cao', label: 'Cão' },
                  { value: 'gato', label: 'Gato' },
                ]}
              />
            </Campo>

            <Campo titulo="Raça *">
              <Input
                placeholder="Raça"
                value={raca}
                onChange={(evento) => setRaca(evento.target.value)}
              />
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
                  { value: 'mini', label: 'Mini' },
                  { value: 'pequeno', label: 'Pequeno' },
                  { value: 'medio', label: 'Médio' },
                  { value: 'grande', label: 'Grande' },
                  { value: 'gigante', label: 'Gigante' },
                ]}
              />
            </Campo>
          </div>

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

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={castrado}
              onChange={(evento) => setCastrado(evento.target.checked)}
            />

            Pet castrado
          </label>

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
              Salvar Pet
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
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