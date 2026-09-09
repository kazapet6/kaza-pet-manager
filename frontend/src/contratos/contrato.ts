export{lerIntencaoVendaContrato,validarDiaAncora}from'../../../supabase/functions/_shared/contrato-venda.ts'
export type{ContratoResumo,IntencaoVendaContrato,ItemVendaContrato,ModalidadeTransporteContrato,RespostaVendaContrato}from'../../../supabase/functions/_shared/contrato-venda.ts'
import type{SimulacaoPacote}from'../pacotes/contrato.ts'
export function resumoAjuste(sim:SimulacaoPacote,valor:number){const diferenca=Math.round((valor-sim.totalPacote)*100)/100;return{diferenca,percentual:sim.totalPacote===0?null:Math.round(diferenca/sim.totalPacote*10000)/100,economiaEfetiva:Math.round((sim.totalAvulso-valor)*100)/100}}
