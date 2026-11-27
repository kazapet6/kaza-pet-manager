import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarOrigensPermitidas } from '../_shared/cors.ts'
import { criarHandlerStatus, criarValidadorTokenStatus } from './handler.ts'
import { alterarStatusComBackendConfiavel } from './servico.ts'
import { pularCicloComMotor } from './pulo-ciclo.ts'
import { criarAssinadorRenovacao } from '../renovar-contrato/assinatura.ts'
import { renovarAutomaticamente } from '../renovar-contrato/servico.ts'

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) throw new Error('Configuracao segura da Edge Function ausente.')
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const auth = createClient(url, anonKey, opcoes)
const admin = createClient(url, serviceRoleKey, opcoes)
const origens = criarOrigensPermitidas(Deno.env.get('ALLOWED_ORIGINS'))
const assinador = await criarAssinadorRenovacao(serviceRoleKey)

Deno.serve(criarHandlerStatus({
  validarToken: criarValidadorTokenStatus(auth),
  autorizarPulo: async (usuario, senha) => {
    if (!usuario.email) return false
    const verificacao = createClient(url, anonKey, opcoes)
    const { data, error } = await verificacao.auth.signInWithPassword({ email: usuario.email, password: senha })
    if (error || !data.user) return false
    const autorizado = data.user.id === usuario.id && data.user.app_metadata.creditos_admin === true
    await verificacao.auth.signOut({ scope: 'local' })
    return autorizado
  },
  pular: (intencao, usuarioId, autorizado) => pularCicloComMotor(intencao, usuarioId, autorizado, admin),
  alterar: (intencao, usuarioId) => alterarStatusComBackendConfiavel(
    intencao, usuarioId, admin, cicloId => renovarAutomaticamente(cicloId, usuarioId, admin, assinador),
  ),
}, origens))
