/**
 * Solicitação de TEMPLATE Meta (utility) — preparação sem envio.
 * Deve ser revisado no Gerenciador do WhatsApp/Meta antes de submissão.
 * A posição dos botões deve coincidir com o payload de envio:
 *   0 = Confirmar; 1 = Remarcar.
 * NÃO submete nada à API, NÃO cria template por conta própria.
 */
export type TemplateParaAprovacao = {
  name:string
  language:'pt_BR'
  category:'UTILITY'
  parameter_format:'POSITIONAL'
  components:Array<
    {type:'BODY';text:string;example:{body_text:string[][]}} |
    {type:'BUTTONS';buttons:Array<{type:'QUICK_REPLY';text:string}>}
  >
}
export const NOME_TEMPLATE_HML='kaza_confirmacao_agendamento_hml'
export function prepararSolicitacaoTemplateMeta():TemplateParaAprovacao {
  return {
    name:NOME_TEMPLATE_HML,
    language:'pt_BR',
    category:'UTILITY',
    parameter_format:'POSITIONAL',
    components:[
      {type:'BODY',
        text:'Olá, {{1}}! 🐾\n\nO banho de {{2}} está agendado para {{3}} às {{4}} na KAZA PET.\n\nPodemos confirmar esse horário?',
        example:{body_text:[['Mariana','Thor','24/11/2026','09:00']]}},
      {type:'BUTTONS',buttons:[
        {type:'QUICK_REPLY',text:'Confirmar'},
        {type:'QUICK_REPLY',text:'Remarcar'}
      ]}
    ]
  }
}
