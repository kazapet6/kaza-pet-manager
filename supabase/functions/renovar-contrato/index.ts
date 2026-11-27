import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarOrigensPermitidas } from '../_shared/cors.ts'
import { criarHandlerRenovacao } from './handler.ts'
import { criarAssinadorRenovacao } from './assinatura.ts'
import { executarRenovacao } from './servico.ts'
const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anon || !secret) throw new Error('Configuração segura da renovação ausente.')
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
const auth = createClient(url, anon, opcoes), admin = createClient(url, secret, opcoes)
// HMAC com separação de domínio; nenhuma chave ou token é retornado/logado.
const assinador = await criarAssinadorRenovacao(secret)
Deno.serve(criarHandlerRenovacao({ validarToken: async token => { const { data, error } = await auth.auth.getUser(token); return error ? null : data.user }, executar: (i, usuarioId) => executarRenovacao(i, usuarioId, admin, assinador) }, criarOrigensPermitidas(Deno.env.get('ALLOWED_ORIGINS'))))
