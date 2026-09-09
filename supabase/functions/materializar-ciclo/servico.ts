import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { materializarCiclo } from '../_shared/materializacao-ciclo.ts'

export function executarMaterializacaoCiclo(cicloId: string, usuarioId: string, admin: SupabaseClient) {
  return materializarCiclo(cicloId, usuarioId, admin)
}
