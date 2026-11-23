import { useState } from 'react'
import { WHATSAPP_HML_HABILITADO } from '../whatsappHml/configuracao'

const CORPO='Olá, {{1}}! 🐾\n\nO banho de {{2}} está agendado para {{3}} às {{4}} na KAZA PET.\n\nPodemos confirmar esse horário?'
export const TEMPLATE_META_HML='kaza_confirmacao_agendamento_hml'

export default function TemplateMetaHml() {
  const [copiado,setCopiado]=useState('')
  if(!WHATSAPP_HML_HABILITADO) return (
    <section className="msg-coming">
      <h2>Integrações da Mensageria</h2>
      <p>As configurações do template Meta serão disponibilizadas após a homologação.</p>
    </section>
  )
  async function copiar(valor:string) {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado('Copiado. Nenhuma mensagem foi enviada.')
    } catch {
      setCopiado('Não foi possível copiar automaticamente. Selecione e copie o texto exibido.')
    }
  }
  return <section className="msg-coming" style={{textAlign:'left'}}>
    <div className="msg-panel-heading">
      <div>
        <h2>Template de confirmação · Meta</h2>
        <p>Proposta para aprovação na plataforma WhatsApp Business.</p>
      </div>
      <span className="msg-pill">Não submetido à Meta</span>
    </div>
    <div className="msg-info">
      <strong>Integração ainda desligada</strong>
      <p>Esta tela não cria templates na Meta, não envia WhatsApp e não ativa automações.</p>
      <p>Aprovação e disponibilidade de templates na WABA de homologação ainda precisam ser verificadas.</p>
    </div>
    <div className="msg-event-grid">
      <div><strong>Nome proposto</strong>
        <code>{TEMPLATE_META_HML}</code>
      </div>
      <div><strong>Categoria e idioma</strong>
        <span>UTILITY · Português (Brasil)</span>
      </div>
    </div>
    <div className="msg-panel-heading" style={{marginTop:24}}>
      <div><h2>Mensagem para revisão</h2>
        <p>Os campos {'{{1}}'}, {'{{2}}'}, {'{{3}}'} e {'{{4}}'} serão preenchidos a partir da agenda.</p>
      </div>
      <button type="button" className="msg-quiet" onClick={()=>void copiar(CORPO)}>Copiar texto</button>
    </div>
    <div className="msg-phone" style={{maxWidth:440}}>
      <div className="msg-phone-top">🐾 KAZA PET <span>prévia de template</span></div>
      <div className="msg-bubble">{CORPO}</div>
      <div className="msg-buttons">
        <span>✓ Confirmar</span>
        <span>↻ Remarcar</span>
        <small>Botões ilustrativos — não enviam respostas.</small>
      </div>
    </div>
    <p role="status" className="msg-hint">{copiado}</p>
    <p className="msg-hint"><strong>Exemplos:</strong> 1 = Mariana, 2 = Thor, 3 = 24/11/2026, 4 = 09:00.</p>
    <p className="msg-hint">Antes de usar: conferir permissão da WABA, enviar à revisão Meta, confirmar status APPROVED,
      idioma, ordem dos botões e reconciliação segura do envio. O link de remarcação será desenvolvido separadamente.</p>
  </section>
}
