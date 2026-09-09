import type { ContagemCreditos } from '../../../supabase/functions/_shared/credito-contrato.ts'
import { faixaDisponibilidade } from '../../../supabase/functions/_shared/credito-contrato.ts'

type ContagemVisual = Pick<ContagemCreditos, 'consumoPercentual' | 'disponibilidadePercentual'> &
  Partial<Pick<ContagemCreditos, 'contratados' | 'consumidos' | 'perdidos' | 'disponiveis'>>

export function BarraConsumoContrato({ contagem, compacta = false }: { contagem: ContagemVisual; compacta?: boolean }) {
  const possuiContagens = contagem.consumidos !== undefined && contagem.contratados !== undefined
  return (
    <div className={`contrato-consumo ${faixaDisponibilidade(contagem)} ${compacta ? 'compacta' : ''}`}>
      <div className="contrato-consumo-cabecalho">
        <span>Consumo do ciclo</span>
        <strong>{contagem.consumoPercentual}%</strong>
      </div>
      <div className="contrato-consumo-trilha" aria-label={`${contagem.consumoPercentual}% consumido`}>
        <span style={{ width: `${contagem.consumoPercentual}%` }} />
      </div>
      {possuiContagens && !compacta && (
        <small>{contagem.consumidos} de {contagem.contratados} créditos utilizados</small>
      )}
    </div>
  )
}

export function ResumoContagemContrato({ contagem, mostrarContratados = false }: { contagem: ContagemVisual; mostrarContratados?: boolean }) {
  return (
    <div className="contrato-contagens" aria-label="Resumo dos créditos do ciclo">
      {mostrarContratados && <span><strong>{contagem.contratados ?? 0}</strong> contratados</span>}
      <span><strong>{contagem.consumidos ?? 0}</strong> consumidos</span>
      <span><strong>{contagem.disponiveis ?? 0}</strong> disponíveis</span>
      {(contagem.perdidos ?? 0) > 0 && <span className="contrato-contagem-perdida"><strong>{contagem.perdidos}</strong> perdidos</span>}
    </div>
  )
}
