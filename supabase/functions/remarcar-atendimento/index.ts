import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarHandlerRemarcacao, criarValidadorTokenRemarcacao } from './handler.ts'
import { remarcarComBackendConfiavel } from './servico.ts'

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) throw new Error('Configuracao segura da Edge Function ausente.')
const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const origens = new Set((Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((item) => item.trim()).filter(Boolean))
Deno.serve(criarHandlerRemarcacao({ validarToken: criarValidadorTokenRemarcacao(auth), remarcar: (item) => remarcarComBackendConfiavel(item, admin) }, origens))
