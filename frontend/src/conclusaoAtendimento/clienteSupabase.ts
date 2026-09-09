import { supabase } from '../lib/supabase.ts'
import type { ConclusaoDadosIntent,ConclusaoDadosResposta } from './contrato.ts'
export async function executarDadosConclusao(intencao:ConclusaoDadosIntent):Promise<ConclusaoDadosResposta>{
 const {data:s,error}=await supabase.auth.getSession();if(error||!s.session?.access_token)throw new Error('Sessao obrigatoria.')
 const resposta=await supabase.functions.invoke('dados-conclusao-atendimento',{body:intencao,headers:{Authorization:`Bearer ${s.session.access_token}`}})
 if(resposta.error)throw resposta.error;return resposta.data as ConclusaoDadosResposta
}
