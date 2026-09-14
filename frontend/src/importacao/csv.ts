// Parser local: campos fora da allowlist são descartados antes de criar objetos.
export const CAMPOS_CLIENTES = ['id', 'nome', 'telefone', 'email', 'cpf', 'dataNascimento',
  'cep', 'endereco', 'numero', 'bairro', 'complemento', 'cidade', 'estado', 'observacoes', 'createdAt'] as const
export const CAMPOS_PETS = ['id', 'clienteId', 'nome', 'especie', 'raca', 'genero', 'tamanho',
  'pelo', 'nascimento', 'peso', 'castrado', 'cor', 'comportamento', 'observacoes', 'situacao', 'createdAt'] as const
export type LinhaCSV = { linha: number; valores: Record<string, string> }

export function lerCSV(texto: string, campos: readonly string[]): LinhaCSV[] {
  if (texto.length > 10_000_000) throw new Error('Arquivo excede o limite de 10 milhões de caracteres.')
  const origem = texto.replace(/^\uFEFF/, '')
  let cabecalho: string[] | undefined
  const resultado: LinhaCSV[] = []
  let celulas: string[] = [], valor = '', aspas = false, fechou = false, linha = 1, inicio = 1
  const concluirCelula = () => { celulas.push(valor); valor = ''; fechou = false }
  const concluirRegistro = () => {
    concluirCelula()
    if (celulas.length === 1 && celulas[0] === '') { celulas = []; return }
    if (!cabecalho) {
      cabecalho = celulas.map(c => c.trim())
      if (new Set(cabecalho).size !== cabecalho.length || cabecalho.some(c => !c)) {
        throw new Error('Cabeçalho vazio ou duplicado.')
      }
      if (!cabecalho.includes('id') || !cabecalho.includes('nome')) throw new Error('Cabeçalho precisa de id e nome.')
      if (campos === CAMPOS_PETS && !cabecalho.includes('clienteId')) throw new Error('Cabeçalho de pets precisa de clienteId.')
      if (campos === CAMPOS_CLIENTES && cabecalho.includes('clienteId')) throw new Error('Este arquivo é de pets. Selecione clientes.csv no campo Clientes.')
    } else {
      if (celulas.length !== cabecalho.length) throw new Error(`Quantidade de colunas inválida na linha ${inicio}.`)
      const valores: Record<string, string> = Object.create(null)
      cabecalho.forEach((campo, i) => { if (campos.includes(campo)) valores[campo] = celulas[i].trim() })
      resultado.push({ linha: inicio, valores })
      if (resultado.length > 10_000) throw new Error('Arquivo excede o limite de 10 mil registros.')
    }
    celulas = []
  }
  for (let i = 0; i < origem.length; i++) {
    const c = origem[i]
    if (aspas) {
      if (c === '"') {
        if (origem[i + 1] === '"') { valor += '"'; i++ } else { aspas = false; fechou = true }
      } else { valor += c; if (c === '\n') linha++ }
    } else if (c === ';') concluirCelula()
    else if (c === '\r' || c === '\n') {
      concluirRegistro()
      if (c === '\r' && origem[i + 1] === '\n') i++
      linha++; inicio = linha
    } else if (c === '"' && valor === '' && !fechou) aspas = true
    else {
      if (c === '"' || fechou) throw new Error(`Aspas inválidas na linha ${linha}.`)
      valor += c
    }
  }
  if (aspas) throw new Error('Campo com aspas não encerradas.')
  if (valor || celulas.length || fechou) concluirRegistro()
  if (!cabecalho) throw new Error('Arquivo vazio.')
  return resultado
}

export const normalizar = (valor: string) => valor.normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim()

// Deve permanecer equivalente a public.importacao_normalizar_duplicidade.
export const normalizarDuplicidade = (valor: string) => valor.toLowerCase()
  .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
  .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
  .replace(/[-–—\s]+/g, ' ').trim()

export function mapearEnum(campo: string, valor: string): string | boolean | null {
  const mapas: Record<string, Record<string, string | boolean>> = {
    especie: { cachorro: 'cao', cao: 'cao', gato: 'gato' },
    genero: { macho: 'macho', femea: 'femea' },
    tamanho: { pequeno: 'pequeno', medio: 'medio', grande: 'grande', gigante: 'gigante', mini: 'mini' },
    pelo: { curto: 'curta', curta: 'curta', medio: 'media', media: 'media', longo: 'longa', longa: 'longa' },
    castrado: { t: true, true: true, sim: true, f: false, false: false, nao: false },
    comportamento: { calmo: 'calmo', moderado: 'moderado', dificil: 'dificil' },
  }
  return mapas[campo]?.[normalizar(valor)] ?? null
}

export type RacaImportacao = { id: string; especie: string; nome: string; ativo: boolean; sinonimos?: string[] }
export function resolverRaca(valor: string, especie: string | null, racas: RacaImportacao[]): string | null {
  if (!valor.trim() || !especie) return null
  const candidatas = new Set(racas.filter(r => r.ativo && r.nome.trim() !== '2' && r.especie === especie &&
    [r.nome, ...(r.sinonimos ?? [])].some(n => normalizar(n) === normalizar(valor))).map(r => r.id))
  return candidatas.size === 1 ? [...candidatas][0] : null
}

export type Aviso = { tipo: 'clientes' | 'pets'; linha: number; codigo: string; campo: string; bloqueante: boolean }
export function analisarVinculosDuplicidades(clientes: LinhaCSV[], pets: LinhaCSV[]) {
  const avisos: Aviso[] = []
  const adicionar = (tipo: Aviso['tipo'], r: LinhaCSV, codigo: string, campo: string, bloqueante = false) =>
    avisos.push({ tipo, linha: r.linha, codigo, campo, bloqueante })
  const ids = new Map<string, number>()
  for (const c of clientes) if (c.valores.id) ids.set(c.valores.id, (ids.get(c.valores.id) ?? 0) + 1)
  for (const [tipo, linhas] of [['clientes', clientes], ['pets', pets]] as const) {
    for (const r of linhas) {
      if (!r.valores.id) adicionar(tipo, r, 'ID_EXTERNO_AUSENTE', 'id', true)
      if (!r.valores.nome) adicionar(tipo, r, 'NOME_AUSENTE', 'nome', true)
      else if (/^[\d\s()+-]+$/.test(r.valores.nome)) adicionar(tipo, r, 'NOME_NUMERICO', 'nome')
    }
    const chaves: [string, (v: Record<string, string>) => string][] = [['id', v => v.id ?? '']]
    if (tipo === 'clientes') chaves.push(
      ['cpf', v => (v.cpf ?? '').replace(/\D/g, '')],
      ['telefone', v => (v.telefone ?? '').replace(/\D/g, '')],
      ['email', v => (v.email ?? '').trim().toLowerCase()],
      ['nome+telefone', v => v.nome && v.telefone ? `${normalizarDuplicidade(v.nome)}|${v.telefone.replace(/\D/g, '')}` : ''])
    else chaves.push(
      ['tutor+nome', v => v.clienteId && v.nome ? `${v.clienteId}|${normalizarDuplicidade(v.nome)}` : ''],
      ['tutor+nome+raca', v => v.clienteId && v.nome && v.raca ? `${v.clienteId}|${normalizarDuplicidade(v.nome)}|${normalizarDuplicidade(v.raca)}` : ''])
    for (const [campo, chave] of chaves) {
      const grupos = new Map<string, LinhaCSV[]>()
      for (const r of linhas) { const k = chave(r.valores); if (k) grupos.set(k, [...(grupos.get(k) ?? []), r]) }
      for (const grupo of grupos.values()) if (grupo.length > 1) {
        for (const r of grupo) adicionar(tipo, r, 'POSSIVEL_DUPLICIDADE', campo, campo === 'id')
      }
    }
  }
  let vinculados = 0
  for (const p of pets) {
    if (ids.get(p.valores.clienteId) === 1) vinculados++
    else adicionar('pets', p, ids.has(p.valores.clienteId) ? 'TUTOR_AMBIGUO' : 'TUTOR_NAO_RESOLVIDO', 'clienteId', true)
  }
  return { clientes: clientes.length, pets: pets.length, vinculados, semTutorResolvido: pets.length - vinculados, avisos }
}
