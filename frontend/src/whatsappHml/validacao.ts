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
