import type { User } from '@supabase/supabase-js'

export const ROLE_INTERNA = 'internal'

export type EstadoAutenticacao =
  | 'carregando'
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'autorizado'

export function classificarUsuarioInterno(
  usuario: Pick<User, 'app_metadata'> | null,
): Exclude<EstadoAutenticacao, 'carregando'> {
  if (!usuario) return 'nao_autenticado'
  return usuario.app_metadata.role === ROLE_INTERNA
    ? 'autorizado'
    : 'sem_permissao'
}
