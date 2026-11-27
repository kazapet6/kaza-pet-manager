import { createClient } from 'npm:@supabase/supabase-js@2.112.2'
import { criarOrigensPermitidas } from '../_shared/cors.ts'
import { criarHandler044 } from './handler.ts'
import { criarAssinador044 } from './assinatura.ts'
import { executar044 } from './servico.ts'
const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !anon || !secret) throw new Error('Configuração segura ausente.')
const options = { auth: { persistSession: false, autoRefreshToken: false } }, auth = createClient(url, anon, options), admin = createClient(url, secret, options), assinador = await criarAssinador044(secret)
Deno.serve(criarHandler044({ validarToken: async token => { const { data, error } = await auth.auth.getUser(token); return error ? null : data.user }, executar: (i, id) => executar044(i, id, admin, assinador) }, criarOrigensPermitidas(Deno.env.get('ALLOWED_ORIGINS'))))
