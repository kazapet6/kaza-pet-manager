import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { renovarAutomaticamente } from './servico.ts'
import type { criarAssinadorRenovacao } from './assinatura.ts'

type Assinador = Awaited<ReturnType<typeof criarAssinadorRenovacao>>

export async function processarPendencias(admin: SupabaseClient, assinador: Assinador, filtro?: string) {
  const consulta = admin.from('contratos')
    .select('id,valor_contratado,contrato_ciclos(id,numero,estado,situacao_financeira,materializacao_estado,criado_por)')
    .eq('status', 'ativo').eq('renovacao_automatica', true).order('id')
  if (filtro) consulta.eq('id', filtro)
  let falhas = 0
  for (let inicio = 0;; inicio += 100) {
    const { data: contratos, error } = await consulta.range(inicio, inicio + 99)
    if (error) throw new Error('Consulta de pendências indisponível.')
    for (const contrato of contratos) {
      const ciclos = [...contrato.contrato_ciclos].sort((a, b) => b.numero - a.numero)
      const [atual, anterior] = ciclos
      // Retoma materialização já confirmada pelo mesmo recibo, sem planejar uma nova renovação.
      const origem = atual?.estado === 'concluido' ? atual :
        atual?.estado === 'reservado' && atual.materializacao_estado !== 'materializado' ? anterior : undefined
      if (origem?.estado !== 'concluido' ||
          (Number(contrato.valor_contratado) > 0 && origem.situacao_financeira !== 'pago')) continue
      try {
        await renovarAutomaticamente(origem.id, origem.criado_por, admin, assinador)
        console.log(JSON.stringify({ evento: 'renovacao_pendente_verificada', cicloId: origem.id }))
      } catch {
        falhas++
        console.error(JSON.stringify({ evento: 'renovacao_pendente_tentativa_falhou', cicloId: origem.id }))
      }
    }
    if (contratos.length < 100) return falhas
  }
}
