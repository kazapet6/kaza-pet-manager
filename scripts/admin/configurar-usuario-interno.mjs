import { createRequire } from 'node:module'

const obrigatorias = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_USER_ID',
]

const ausentes = obrigatorias.filter((nome) => !process.env[nome]?.trim())
if (ausentes.length) {
  process.stderr.write(`Variáveis obrigatórias ausentes: ${ausentes.join(', ')}.\n`)
  process.exitCode = 1
} else {
  const requireFrontend = createRequire(
    new URL('../../frontend/package.json', import.meta.url),
  )
  const { createClient } = requireFrontend('@supabase/supabase-js')
  const url = process.env.SUPABASE_URL
  const chaveAdministrativa = process.env.SUPABASE_SERVICE_ROLE_KEY
  const usuarioId = process.env.SUPABASE_USER_ID
  const admin = createClient(url, chaveAdministrativa, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { data: consulta, error: erroConsulta } =
    await admin.auth.admin.getUserById(usuarioId)
  if (erroConsulta || !consulta.user) {
    process.stderr.write('Não foi possível consultar o usuário informado.\n')
    process.exitCode = 1
  } else {
    const appMetadata = {
      ...consulta.user.app_metadata,
      role: 'internal',
    }
    const { data: atualizacao, error: erroAtualizacao } =
      await admin.auth.admin.updateUserById(usuarioId, {
        app_metadata: appMetadata,
      })
    if (erroAtualizacao || atualizacao.user.app_metadata.role !== 'internal') {
      process.stderr.write('Não foi possível configurar o usuário interno.\n')
      process.exitCode = 1
    } else {
      process.stdout.write(`Usuário: ${atualizacao.user.id}\n`)
      process.stdout.write('Configuração interna aplicada com sucesso.\n')
    }
  }
}
