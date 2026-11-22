// Piloto: habilitado somente no Supabase de homologação, nunca em produção.
export const REF_HML_WHATSAPP = 'jgtctzqieyorhvqxjbpk'
export const WHATSAPP_HML_HABILITADO =
  import.meta.env.VITE_WHATSAPP_HML_ENABLED === 'true' &&
  import.meta.env.VITE_SUPABASE_URL === `https://${REF_HML_WHATSAPP}.supabase.co`

export function numeroWhatsAppBrasil(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '')
  const normalizado = digitos.startsWith('55') ? digitos : `55${digitos}`
  return /^55[1-9][0-9][0-9]{8,9}$/.test(normalizado) ? normalizado : null
}

export function validarTextoManual(texto: string): string | null {
  const limpo = texto.trim()
  if (limpo.length < 1 || limpo.length > 512) return null
  return limpo
}
