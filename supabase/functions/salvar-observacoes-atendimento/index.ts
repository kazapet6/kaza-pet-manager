import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarOrigensPermitidas } from '../_shared/cors.ts'
import { criarHandlerObservacoes, criarValidadorTokenObservacoes } from './handler.ts'
import { carregarObservacoesBackend, salvarObservacoesBackend } from './servico.ts'

const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anonKey || !serviceRoleKey) throw new Error('Configuracao segura da Edge Function ausente.')
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const auth = createClient(url, anonKey, opcoes), admin = createClient(url, serviceRoleKey, opcoes)
const origens = criarOrigensPermitidas(Deno.env.get('ALLOWED_ORIGINS'))
Deno.serve(criarHandlerObservacoes({ validarToken: criarValidadorTokenObservacoes(auth), executar: (intencao) => intencao.operacao === 'carregar' ? carregarObservacoesBackend(intencao.atendimentoId, admin) : salvarObservacoesBackend(intencao, admin) }, origens))
