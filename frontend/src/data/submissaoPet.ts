export type ResultadoSubmissao<T> =
  | { executado: true; valor: T }
  | { executado: false }

export function criarTravaSubmissaoPet() {
  let emAndamento = false

  return {
    ativa() {
      return emAndamento
    },
    async executar<T>(acao: () => Promise<T>): Promise<ResultadoSubmissao<T>> {
      if (emAndamento) return { executado: false }
      emAndamento = true
      try {
        return { executado: true, valor: await acao() }
      } catch (erro) {
        emAndamento = false
        throw erro
      }
    },
    liberar() {
      emAndamento = false
    },
  }
}
