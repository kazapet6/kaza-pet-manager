import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarHandlerStatus, criarValidadorTokenStatus } from './handler.ts'
import { alterarStatusComBackendConfiavel } from './servico.ts'

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) throw new Error('Configuracao segura da Edge Function ausente.')
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const auth = createClient(url, anonKey, opcoes)
const admin = createClient(url, serviceRoleKey, opcoes)
const origens = new Set((Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((item) => item.trim()).filter(Boolean))

Deno.serve(criarHandlerStatus({
  validarToken: criarValidadorTokenStatus(auth),
  alterar: (intencao, usuarioId) => alterarStatusComBackendConfiavel(intencao, usuarioId, admin),
}, origens))
