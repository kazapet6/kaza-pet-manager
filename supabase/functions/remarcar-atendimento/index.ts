import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarOrigensPermitidas } from '../_shared/cors.ts'
import { criarHandlerRemarcacao, criarValidadorTokenRemarcacao } from './handler.ts'
import { remarcarComBackendConfiavel } from './servico.ts'

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) throw new Error('Configuracao segura da Edge Function ausente.')
const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const origens = criarOrigensPermitidas(Deno.env.get('ALLOWED_ORIGINS'))
Deno.serve(criarHandlerRemarcacao({ validarToken: criarValidadorTokenRemarcacao(auth), remarcar: (item) => remarcarComBackendConfiavel(item, admin) }, origens))
