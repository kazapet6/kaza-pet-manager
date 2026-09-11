import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarOrigensPermitidas } from '../_shared/cors.ts'
import { criarHandlerDadosConclusao, validador } from './handler.ts'
import { executarDadosConclusaoBackend } from './servico.ts'

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) {
  throw new Error('Configuracao ausente.')
}

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const auth = createClient(url, anonKey, opcoes)
const admin = createClient(url, serviceRoleKey, opcoes)
const origens = criarOrigensPermitidas(Deno.env.get('ALLOWED_ORIGINS'))

Deno.serve(criarHandlerDadosConclusao({
  validarToken: validador(auth),
  executar: (intencao) => executarDadosConclusaoBackend(intencao, admin),
}, origens))
