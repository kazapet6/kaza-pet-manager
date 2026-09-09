import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { calcularDisponibilidade } from '../../frontend/src/motorDisponibilidade/motor.ts'
import { carregarDadosDisponibilidadeComCliente } from '../../frontend/src/motorDisponibilidade/supabase.ts'
import { gerarChaveIdempotencia } from '../../frontend/src/confirmacao/contrato.ts'

const obrigatorias = [
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_TEST_EMAIL', 'SUPABASE_TEST_PASSWORD',
]
const ausentes = obrigatorias.filter((nome) => !process.env[nome]?.trim())
if (ausentes.length) {
  process.stderr.write(`Variaveis obrigatorias ausentes: ${ausentes.join(', ')}.\n`)
  process.exitCode = 1
} else {
  const requireFrontend = createRequire(
    new URL('../../frontend/package.json', import.meta.url),
  )
  const { createClient } = requireFrontend('@supabase/supabase-js')
  const cliente = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    } },
  )
  const { data: login, error: erroLogin } = await cliente.auth.signInWithPassword({
    email: process.env.SUPABASE_TEST_EMAIL,
    password: process.env.SUPABASE_TEST_PASSWORD,
  })
  if (erroLogin || !login.session) {
    process.stderr.write('Nao foi possivel autenticar a conta interna de teste.\n')
    process.exitCode = 1
  } else {
    const [pet, servico, configuracao, versaoConfiguracao, versaoOcupacao] =
      await Promise.all([
        unico(cliente.from('pets').select('id').eq('nome', 'TESTE_EDGE_G_PET')),
        unico(cliente.from('servicos').select('id').eq('nome', 'TESTE_EDGE_G_SERVICO')),
        unico(cliente.from('configuracao_agenda')
          .select('timezone, horizonte_dias').eq('id', true)),
        unico(cliente.from('agenda_versao_configuracao')
          .select('versao').eq('id', true)),
        unico(cliente.from('agenda_versao_ocupacao')
          .select('versao').eq('id', true)),
      ])
    const hoje = dataNoTimezone(new Date(), configuracao.timezone)
    const limite = Math.min(Number(configuracao.horizonte_dias), 60)
    let selecionada = null
    let ultimoResultado = null
    for (let deslocamento = 1; deslocamento <= limite; deslocamento += 1) {
      const data = adicionarDias(hoje, deslocamento)
      const entrada = {
        petId: pet.id, servicoIds: [servico.id], data,
        preferenciaFuncionario: 'automatico', funcionarioPreferidoId: null,
        tipoPlanejamento: 'normal', modalidade: 'sem_transporte',
        cicloTaxidogId: null,
      }
      const dados = await carregarDadosDisponibilidadeComCliente(entrada, cliente)
      const resultado = calcularDisponibilidade(entrada, dados)
      ultimoResultado = resultado
      const opcao = [...resultado.opcoes]
        .sort((a, b) => a.horarioApresentado - b.horarioApresentado)[0]
      if (opcao) { selecionada = { data, opcao }; break }
    }
    if (!selecionada) {
      process.stderr.write(`Nenhuma opcao futura foi encontrada nos proximos ${limite} dias.\n`)
      if (ultimoResultado) {
        process.stderr.write(`Estado: ${ultimoResultado.estado}\n`)
        process.stderr.write(
          `Motivos: ${ultimoResultado.motivos.length
            ? ultimoResultado.motivos.join(' | ')
            : '<nenhum informado>'}\n`,
        )
      }
      process.exitCode = 1
    } else {
      const intencao = {
        chaveIdempotencia: gerarChaveIdempotencia(),
        petId: pet.id, servicoIds: [servico.id], data: selecionada.data,
        horarioEscolhido: selecionada.opcao.horarioApresentado,
        modalidade: 'sem_transporte', cicloTaxidogId: null,
        preferenciaFuncionario: 'automatico', funcionarioPreferidoId: null,
        versaoConfiguracaoConsultada: Number(versaoConfiguracao.versao),
        versaoOcupacaoConsultada: Number(versaoOcupacao.versao),
      }
      const diretorio = new URL('./.tmp/', import.meta.url)
      const destino = new URL('intencao-edge-dev.json', diretorio)
      await mkdir(diretorio, { recursive: true })
      await writeFile(destino, `${JSON.stringify(intencao, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx',
      })
      process.stdout.write(`Intencao criada: ${destino.pathname}\n`)
      process.stdout.write(`Data: ${intencao.data}\n`)
      process.stdout.write(`Horario em minutos: ${intencao.horarioEscolhido}\n`)
    }
    await cliente.auth.signOut({ scope: 'local' })
  }
}

async function unico(consulta) {
  const { data, error } = await consulta.single()
  if (error) throw new Error('Nao foi possivel consultar uma fixture obrigatoria.')
  return data
}

function dataNoTimezone(instante, timezone) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instante)
  const valor = (tipo) => partes.find((item) => item.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

function adicionarDias(data, quantidade) {
  const [ano, mes, dia] = data.split('-').map(Number)
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + quantidade))
  return resultado.toISOString().slice(0, 10)
}
