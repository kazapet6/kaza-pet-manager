// Controle em duas etapas: flag explícita e identidade exata do backend HML.
export const REF_HML_WHATSAPP = 'jgtctzqieyorhvqxjbpk'
export const WHATSAPP_HML_HABILITADO =
  import.meta.env.VITE_WHATSAPP_HML_ENABLED === 'true' &&
  import.meta.env.VITE_SUPABASE_URL === `https://${REF_HML_WHATSAPP}.supabase.co`

// O modo integrado é opt-in e nunca existe fora do projeto HML exato.
export const WHATSAPP_HML_INTEGRADO = WHATSAPP_HML_HABILITADO &&
  import.meta.env.VITE_WHATSAPP_HML_INTEGRADO === 'true'
