export function configuracaoFrontendContemSegredoAdministrativo(
  nomesVariaveis: string[],
) {
  return nomesVariaveis.some((nome) =>
    /service[_-]?role|supabase[_-]?secret/i.test(nome),
  )
}
