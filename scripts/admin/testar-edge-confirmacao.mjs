import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const obrigatorias = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_TEST_EMAIL',
  'SUPABASE_TEST_PASSWORD',
]
const ausentes = obrigatorias.filter((nome) => !process.env[nome]?.trim())
const modo = process.argv[2]
if (ausentes.length || ![
  'invalida', 'configuracao-alterada', 'confirmar',
  'conflito-idempotencia',
].includes(modo)) {
  process.stderr.write(
    ausentes.length
      ? `Variaveis obrigatorias ausentes: ${ausentes.join(', ')}.\n`
      : 'Uso: node scripts/admin/testar-edge-confirmacao.mjs invalida|configuracao-alterada|confirmar|conflito-idempotencia\n',
  )
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
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    } },
  )
  const { data: login, error: erroLogin } = await cliente.auth.signInWithPassword({
    email: process.env.SUPABASE_TEST_EMAIL,
    password: process.env.SUPABASE_TEST_PASSWORD,
  })
  if (erroLogin || !login.session) {
    process.stderr.write('Nao foi possivel autenticar a conta de teste.\n')
    process.exitCode = 1
  } else {
    let corpo = {}
    if (modo !== 'invalida') {
      const caminho = process.env.SUPABASE_INTENT_FILE
      if (!caminho) {
        process.stderr.write('SUPABASE_INTENT_FILE e obrigatoria neste modo.\n')
        process.exitCode = 1
      } else {
        corpo = JSON.parse(await readFile(caminho, 'utf8'))
        if (modo === 'configuracao-alterada') {
          const { data: versao, error } = await cliente
            .from('agenda_versao_configuracao')
            .select('versao').eq('id', true).single()
          if (error) {
            process.stderr.write('Nao foi possivel consultar a versao atual.\n')
            process.exitCode = 1
          } else {
            corpo = {
              ...corpo,
              versaoConfiguracaoConsultada: Number(versao.versao) + 1,
            }
          }
        } else if (modo === 'conflito-idempotencia') {
          corpo = {
            ...corpo,
            versaoOcupacaoConsultada:
              Number(corpo.versaoOcupacaoConsultada) + 1,
          }
        }
      }
    }
    if (!process.exitCode) {
      const resposta = await fetch(
        `${process.env.SUPABASE_URL}/functions/v1/confirmar-agendamento`,
        {
          method: 'POST',
          headers: {
            apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${login.session.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(corpo),
        },
      )
      const respostaTexto = await resposta.text()
      process.stdout.write(`HTTP ${resposta.status}\n`)
      process.stdout.write(`${respostaTexto}\n`)
    }
    await cliente.auth.signOut({ scope: 'local' })
  }
}
