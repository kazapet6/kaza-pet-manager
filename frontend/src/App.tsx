import { useState, type FormEvent } from 'react'
import { useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import './App.css'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Clientes from './pages/Clientes'
import Pets from './pages/Pets'
import Servicos from './pages/Servicos'
import Funcionarios from './pages/Funcionarios'
import Equipamentos from './pages/Equipamentos'
import ConfiguracoesAgenda from './pages/ConfiguracoesAgenda'
import TesteMotorDisponibilidade from './pages/TesteMotorDisponibilidade'
import Pacotes from './pages/Pacotes'
import Contratos from './contratos/Contratos'
import { supabase } from './lib/supabase'
import { classificarUsuarioInterno, type EstadoAutenticacao } from './auth/interna'

function App() {
  const [estadoAutenticacao, setEstadoAutenticacao] = useState<EstadoAutenticacao>('carregando')
  const [usuarioAtual, setUsuarioAtual] = useState<User | null>(null)
  const [paginaAtual, setPaginaAtual] = useState('dashboard')
  const [contratoEmFocoId, setContratoEmFocoId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mensagemLogin, setMensagemLogin] = useState('')
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    let ativo = true

    async function restaurarSessao() {
      const { data: sessao, error: erroSessao } = await supabase.auth.getSession()
      if (!ativo) return
      if (erroSessao || !sessao.session) {
        setUsuarioAtual(null)
        setEstadoAutenticacao('nao_autenticado')
        return
      }
      const { data, error } = await supabase.auth.getUser()
      if (!ativo) return
      const usuario = error ? null : data.user
      setUsuarioAtual(usuario)
      setEstadoAutenticacao(classificarUsuarioInterno(usuario))
    }

    void restaurarSessao()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (!ativo || evento === 'INITIAL_SESSION') return
      const usuario = sessao?.user ?? null
      setUsuarioAtual(usuario)
      setEstadoAutenticacao(classificarUsuarioInterno(usuario))
    })
    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [])

  const dataFormatada = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  async function entrarNoSistema(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setMensagemLogin('')
    if (!email.trim() || !senha) {
      setMensagemLogin('Preencha o email e a senha.')
      return
    }
    setEntrando(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEntrando(false)
    setSenha('')
    if (error || !data.user) {
      const conexao = error?.message.toLowerCase().includes('fetch')
      setMensagemLogin(conexao ? 'Não foi possível conectar ao serviço de autenticação.' : 'Email ou senha inválidos.')
      setEstadoAutenticacao('nao_autenticado')
      return
    }
    setUsuarioAtual(data.user)
    setEstadoAutenticacao(classificarUsuarioInterno(data.user))
  }

  async function sairDoSistema() {
    setEstadoAutenticacao('carregando')
    await supabase.auth.signOut({ scope: 'local' })
    setUsuarioAtual(null)
    setEstadoAutenticacao('nao_autenticado')
    setSenha('')
    setPaginaAtual('dashboard')
  }

  const identidadeUsuario = usuarioAtual?.email ?? 'Usuário interno'
  const avatarLetra = identidadeUsuario
    ? identidadeUsuario.charAt(0).toUpperCase()
    : 'A'

  const nomePagina =
    paginaAtual === 'agenda'
      ? 'Agenda'
      : paginaAtual === 'clientes'
        ? 'Clientes'
        : paginaAtual === 'pets'
          ? 'Pets'
          : paginaAtual === 'servicos'
            ? 'Serviços'
            : paginaAtual === 'funcionarios'
              ? 'Funcionários'
              : paginaAtual === 'equipamentos'
              ? 'Equipamentos'
              : paginaAtual === 'configuracoes'
                ? 'Configurações • Agenda'
              : paginaAtual === 'teste-motor'
                ? 'Teste do Motor de Disponibilidade'
          : paginaAtual === 'pacotes'
            ? 'Pacotes'
          : paginaAtual === 'contratos'
            ? 'Contratos'
            : paginaAtual === 'financeiro'
              ? 'Financeiro'
              : 'Visão geral'

  function renderizarPagina() {
    switch (paginaAtual) {
      case 'agenda':
        return <Agenda onVerContrato={(contratoId) => { setContratoEmFocoId(contratoId); setPaginaAtual('contratos') }} />

      case 'clientes':
        return <Clientes />

      case 'pets':
        return <Pets />

      case 'servicos':
        return <Servicos />

      case 'funcionarios':
        return <Funcionarios />

      case 'equipamentos':
        return <Equipamentos />

      case 'configuracoes':
        return <ConfiguracoesAgenda />

      case 'teste-motor':
        return <TesteMotorDisponibilidade />

      case 'pacotes':
        return <Pacotes />

      case 'contratos':
        return <Contratos contratoInicialId={contratoEmFocoId} onContratoInicialAberto={() => setContratoEmFocoId(null)} />

      case 'financeiro':
        return (
          <section className="panel" style={{ padding: '32px' }}>
            <h2>Financeiro</h2>
            <p>Esta página financeira está em construção.</p>
          </section>
        )

      case 'dashboard':
      default:
        return <Dashboard />
    }
  }

  if (estadoAutenticacao === 'carregando') {
    return <main className="pagina-login"><section className="cartao-login estado-login"><div className="icone-logo">🐾</div><h1>KAZA PET</h1><p>Carregando sessão segura…</p></section></main>
  }

  if (estadoAutenticacao === 'sem_permissao') {
    return <main className="pagina-login"><section className="cartao-login estado-login"><div className="icone-logo">🔒</div><h1>Acesso não autorizado</h1><p>A conta {identidadeUsuario} está autenticada, mas não possui permissão interna.</p><button type="button" onClick={() => void sairDoSistema()}>Sair</button></section></main>
  }

  if (estadoAutenticacao === 'nao_autenticado') {
    return (
      <main className="pagina-login">
        <section className="cartao-login">
          <div className="login-hero">
            <div className="icone-logo">🐾</div>

            <div>
              <h1>KAZA PET</h1>

              <p className="subtitulo">
                Gerencie clientes, pets e agendas com estilo
              </p>
            </div>
          </div>

          <form
            className="formulario-login"
            onSubmit={entrarNoSistema}
          >
            <label htmlFor="email">Email</label>

            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="Digite seu email"
              value={email}
              onChange={(evento) =>
                setEmail(evento.target.value)
              }
            />

            <label htmlFor="senha">Senha</label>

            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
              value={senha}
              onChange={(evento) =>
                setSenha(evento.target.value)
              }
            />

            {mensagemLogin && <p className="mensagem-login" role="alert">{mensagemLogin}</p>}

            <button type="submit" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
          </form>

          <p className="versao">
            KAZA PET Manager • versão 0.2
          </p>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside
        className="sidebar"
        aria-label="Menu lateral"
      >
        <div className="brand">
          <div className="brand-mark">KP</div>

          <div>
            <strong>KAZA PET</strong>
            <small>Manager</small>
          </div>
        </div>

        <nav className="nav-list">
          <button
            className={
              paginaAtual === 'dashboard'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('dashboard')}
          >
            <span className="nav-icon">🏠</span>
            <span>Visão geral</span>
          </button>

          <button
            className={
              paginaAtual === 'agenda'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('agenda')}
          >
            <span className="nav-icon">📅</span>
            <span>Agenda</span>
          </button>

          <button
            className={
              paginaAtual === 'clientes'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('clientes')}
          >
            <span className="nav-icon">👥</span>
            <span>Clientes</span>
          </button>

          <button
            className={
              paginaAtual === 'pets'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('pets')}
          >
            <span className="nav-icon">🐶</span>
            <span>Pets</span>
          </button>

          <button
            className={paginaAtual === 'servicos' ? 'nav-item ativo' : 'nav-item'}
            onClick={() => setPaginaAtual('servicos')}
          >
            <span className="nav-icon">🧼</span>
            <span>Serviços</span>
          </button>

          <button
            className={paginaAtual === 'funcionarios' ? 'nav-item ativo' : 'nav-item'}
            onClick={() => setPaginaAtual('funcionarios')}
          >
            <span className="nav-icon">👤</span>
            <span>Funcionários</span>
          </button>

          <button
            className={paginaAtual === 'equipamentos' ? 'nav-item ativo' : 'nav-item'}
            onClick={() => setPaginaAtual('equipamentos')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Equipamentos</span>
          </button>

          <button
            className={
              paginaAtual === 'pacotes'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('pacotes')}
          >
            <span className="nav-icon">📦</span>
            <span>Pacotes</span>
          </button>

          <button
            className={
              paginaAtual === 'financeiro'
                ? 'nav-item ativo'
                : 'nav-item'
            }
            onClick={() => setPaginaAtual('financeiro')}
          >
            <span className="nav-icon">💰</span>
            <span>Financeiro</span>
          </button>

          <button
            className={paginaAtual === 'contratos' ? 'nav-item ativo' : 'nav-item'}
            onClick={() => setPaginaAtual('contratos')}
          >
            <span className="nav-icon">🧾</span>
            <span>Contratos</span>
          </button>

          <button
            className={paginaAtual === 'teste-motor' ? 'nav-item ativo' : 'nav-item'}
            onClick={() => setPaginaAtual('teste-motor')}
          >
            <span className="nav-icon">🧪</span>
            <span>Teste do Motor</span>
          </button>

          <button
            className={paginaAtual === 'configuracoes' ? 'nav-item ativo' : 'nav-item'}
            onClick={() => setPaginaAtual('configuracoes')}
          >
            <span className="nav-icon">🔧</span>
            <span>Configurações</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            className="logout"
            onClick={() => void sairDoSistema()}
          >
            Sair
          </button>

          <p className="sidebar-note">
            Versão 0.2 • Dashboard premium
          </p>
        </div>
      </aside>

      <main className="dashboard">
        <header className="topbar">
          <div>
            <p className="breadcrumb">
              Painel • {nomePagina}
            </p>

            <h1>Olá, {identidadeUsuario}!</h1>

            <p className="date-label">
              {dataFormatada}
            </p>
          </div>

          <div className="profile-card">
            <div className="profile-avatar">
              {avatarLetra}
            </div>

            <div>
              <strong>{identidadeUsuario}</strong>
              <small>Usuário interno</small>
            </div>
          </div>
        </header>

        {renderizarPagina()}
      </main>
    </div>
  )
}

export default App
