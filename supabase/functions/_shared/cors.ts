export const ORIGENS_OFICIAIS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://kaza-pet-manager.vercel.app',
] as const

export function criarOrigensPermitidas(configuracao: string | null | undefined) {
  const origensConfiguradas = (configuracao ?? '')
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => Boolean(origem) && origem !== '*')

  return new Set<string>([...ORIGENS_OFICIAIS, ...origensConfiguradas])
}
