import { createRequire } from 'node:module'

const obrigatorias = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_TEST_EMAIL',
  'SUPABASE_TEST_PASSWORD',
]
const ausentes = obrigatorias.filter((nome) => !process.env[nome]?.trim())
if (ausentes.length) {
  process.stderr.write(`Variaveis obrigatorias ausentes: ${ausentes.join(', ')}.\n`)
  process.exitCode = 1
} else {
  const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url))
  const { createClient } = requireFrontend('@supabase/supabase-js')
  const cliente = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
  const { data: login, error: erroLogin } = await cliente.auth.signInWithPassword({
    email: process.env.SUPABASE_TEST_EMAIL,
    password: process.env.SUPABASE_TEST_PASSWORD,
  })
  if (erroLogin || !login.session) {
    process.stderr.write('Nao foi possivel autenticar a conta de teste.\n')
    process.exitCode = 1
  } else {
    const [{ data: pets, error: erroPets }, { data: pacotes, error: erroPacotes }] = await Promise.all([
      cliente.from('pets').select('id,nome').ilike('nome', 'jou').limit(1),
      cliente.from('pacotes').select('id,nome,versao,ativo').eq('ativo', true).order('nome').limit(1),
    ])
    if (erroPets || erroPacotes || !pets?.[0] || !pacotes?.[0]) {
      process.stderr.write('Nao foi possivel localizar um pet e um pacote ativos para o diagnostico.\n')
      process.exitCode = 1
    } else {
      const payload = {
        pacoteId: String(pacotes[0].id),
        pacoteVersaoEsperada: Number(pacotes[0].versao),
        petId: String(pets[0].id),
      }
      process.stdout.write(`Payload: ${JSON.stringify(payload)}\n`)
      for (const origem of ['http://127.0.0.1:5173', 'http://localhost:5173']) {
        const resposta = await fetch(
          `${process.env.SUPABASE_URL}/functions/v1/simular-preco-pacote`,
          {
            method: 'POST',
            headers: {
              apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
              authorization: `Bearer ${login.session.access_token}`,
              'content-type': 'application/json',
              origin: origem,
            },
            body: JSON.stringify(payload),
          },
        )
        process.stdout.write(`Origin ${origem}: HTTP ${resposta.status}\n`)
        process.stdout.write(`${await resposta.text()}\n`)
      }
    }
    await cliente.auth.signOut({ scope: 'local' })
  }
}
