import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarOrigensPermitidas } from '../_shared/cors.ts'
import { criarHandlerSimulacaoPacote, validadorSimulacao } from './handler.ts'
import { executarSimulacaoPacote } from './servico.ts'

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) throw new Error('Configuração ausente.')

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const auth = createClient(url, anonKey, opcoes)
const admin = createClient(url, serviceRoleKey, opcoes)
const origens = criarOrigensPermitidas(Deno.env.get('ALLOWED_ORIGINS'))

Deno.serve(criarHandlerSimulacaoPacote({
  validarToken: validadorSimulacao(auth),
  executar: (intencao) => executarSimulacaoPacote(intencao, admin),
}, origens))
