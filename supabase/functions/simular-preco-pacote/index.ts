import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarHandlerSimulacaoPacote, validadorSimulacao } from './handler.ts'
import { executarSimulacaoPacote } from './servico.ts'

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) throw new Error('Configuração ausente.')

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const auth = createClient(url, anonKey, opcoes)
const admin = createClient(url, serviceRoleKey, opcoes)
const origens = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
)

Deno.serve(criarHandlerSimulacaoPacote({
  validarToken: validadorSimulacao(auth),
  executar: (intencao) => executarSimulacaoPacote(intencao, admin),
}, origens))
