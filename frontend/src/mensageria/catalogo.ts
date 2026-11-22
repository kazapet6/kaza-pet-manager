// Catálogo de tags: espelho das 16 entradas verificadas no Supabase HML em 22/11/2026.
// NÃO são dados de clientes. As futuras tags são separadas e não podem ser publicadas.
export type Contexto = 'agenda' | 'atendimento' | 'pacotes' | 'contrato' | 'financeiro'
export type TipoTag = 'texto' | 'data' | 'hora' | 'moeda' | 'id' | 'numero'
export type Tag = {
  codigo: string
  label: string
  contextos: Contexto[]
  exemplo: string
  tipo: TipoTag
  disponivel: boolean
}
export type EventoModelo = {
  codigo: string
  nome: string
  contexto: Contexto
  disponivel: boolean
  descricao: string
}
const todos: Contexto[] = ['agenda','atendimento','pacotes','contrato']
function tag(codigo: string, label: string, contextos: Contexto[], exemplo: string, tipo: TipoTag = 'texto'): Tag {
  return { codigo, label, contextos, exemplo, tipo, disponivel: true }
}
function futura(codigo: string, label: string, contexto: Contexto[], exemplo: string, tipo: TipoTag = 'texto'): Tag {
  return { codigo, label, contextos: contexto, exemplo, tipo, disponivel: false }
}
export const tagsMensageria: Tag[] = [
  tag('NOME_TUTOR','Nome do tutor',todos,'Mariana Souza'),
  tag('NOME_PET','Nome do pet',todos,'Luna'),
  tag('NOME_EMPRESA','Nome da empresa',todos,'KAZA PET'),
  tag('TELEFONE_EMPRESA','Telefone da empresa',todos,'(11) 99999-0000'),
  tag('ID_CLIENTE','ID do cliente',todos,'cli_001','id'),
  tag('ID_PET','ID do pet',todos,'pet_001','id'),
  tag('DATA_AGENDAMENTO','Data do agendamento',['agenda','atendimento'],'25/09/2026','data'),
  tag('HORARIO_AGENDAMENTO','Horário do agendamento',['agenda','atendimento'],'14:30','hora'),
  tag('FUNCIONARIO_RESPONSAVEL','Funcionário responsável',['agenda','atendimento'],'Ana Oliveira'),
  tag('SERVICOS','Serviços',['agenda','atendimento'],'Banho e tosa'),
  tag('VALOR_ATENDIMENTO','Valor do atendimento',['atendimento'],'R$ 85,00','moeda'),
  tag('SALDO_ATENDIMENTO','Saldo do atendimento',['atendimento'],'R$ 20,00','moeda'),
  tag('NOME_PACOTE','Nome do pacote',['pacotes','contrato'],'Banho semanal'),
  tag('VALOR_CONTRATO','Valor do contrato',['contrato'],'R$ 240,00','moeda'),
  tag('DIA_FIXO','Dia fixo',['contrato'],'Sexta-feira'),
  tag('HORARIO_FIXO','Horário fixo',['contrato'],'15:00','hora'),
  futura('BANHOS_UTILIZADOS','Banhos utilizados',['pacotes','contrato'],'3','numero'),
  futura('BANHOS_RESTANTES','Banhos restantes',['pacotes','contrato'],'1','numero'),
  futura('SALDO_CREDITOS','Créditos disponíveis',['pacotes','contrato'],'1','numero'),
  futura('HISTORICO_USOS','Histórico de usos',['pacotes','contrato'],'01/11, 08/11, 15/11'),
  futura('DATA_PROXIMO_BANHO','Próximo banho',['agenda','pacotes','contrato'],'25/11/2026','data'),
  futura('DATA_VENCIMENTO_CICLO','Vencimento do ciclo',['pacotes','contrato'],'30/11/2026','data'),
  futura('NOME_PLANO','Nome do plano',['contrato'],'Banhos ilimitados'),
  futura('STATUS_ASSINATURA','Status da assinatura',['contrato'],'Ativa'),
  futura('VALOR_EM_ABERTO','Valor em aberto',['financeiro'],'R$ 180,00','moeda'),
  futura('DATA_VENCIMENTO','Vencimento',['financeiro'],'20/11/2026','data'),
  futura('REFERENCIA_COBRANCA','Referência da cobrança',['financeiro'],'Pacote mensal'),
  futura('LINK_PAGAMENTO','Link de pagamento',['financeiro'],'https://exemplo.invalid/pagar'),
  futura('DIAS_EM_ATRASO','Dias em atraso',['financeiro'],'2','numero'),
]

export const eventosMensageria: EventoModelo[] = [
  { codigo:'CONFIRMACAO_AGENDAMENTO',nome:'Confirmação de agendamento',contexto:'agenda',disponivel:false,descricao:'Botões Confirmar e Remarcar; webhook e transação ainda em desenvolvimento' },
  { codigo:'NOVO_AGENDAMENTO',nome:'Novo agendamento',contexto:'agenda',disponivel:false,descricao:'Evento existente no banco; envio não habilitado neste editor' },
  { codigo:'LEMBRETE_AGENDAMENTO',nome:'Lembrete de agendamento',contexto:'agenda',disponivel:false,descricao:'Evento reservado, sem disparo automático' },
  { codigo:'PET_PRONTO',nome:'Pet pronto',contexto:'atendimento',disponivel:false,descricao:'Evento reservado, aguardando conexão operacional' },
  { codigo:'PACOTE_ATIVADO',nome:'Pacote ativado',contexto:'contrato',disponivel:false,descricao:'Evento reservado, aguardando conexão operacional' },
  { codigo:'RESUMO_USO_PACOTE',nome:'Histórico de uso de pacote',contexto:'pacotes',disponivel:false,descricao:'Depende da consulta confiável aos créditos e aos banhos consumidos' },
  { codigo:'RESUMO_USO_PLANO',nome:'Histórico de uso de assinatura',contexto:'contrato',disponivel:false,descricao:'Depende do modelo de assinaturas ilimitadas' },
  { codigo:'CLIENTE_ENTROU_INADIMPLENCIA',nome:'Cobrança por inadimplência',contexto:'financeiro',disponivel:false,descricao:'Depende do Financeiro, não bloqueia o editor' },
]

export const modelosExemplo: Array<{id:string;nome:string;eventoCodigo:string;contexto:Contexto;texto:string}> = [
  { id:'ex-confirmacao',nome:'Confirmação de agendamento',eventoCodigo:'CONFIRMACAO_AGENDAMENTO',contexto:'agenda',texto:'Olá, {{NOME_TUTOR}}! 💚\n\nO {{NOME_PET}} tem um agendamento em {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}.\n\nPodemos confirmar?\n\nEquipe {{NOME_EMPRESA}} 🐾' },
  { id:'ex-uso',nome:'Resumo de banhos do pacote',eventoCodigo:'RESUMO_USO_PACOTE',contexto:'pacotes',texto:'Olá, {{NOME_TUTOR}}! 🐶\n\nResumo do pacote {{NOME_PACOTE}} do {{NOME_PET}}:\nBanhos realizados: {{BANHOS_UTILIZADOS}}\nCréditos restantes: {{SALDO_CREDITOS}}\nPróxima visita: {{DATA_PROXIMO_BANHO}}\n\n{{NOME_EMPRESA}} 💚' },
  { id:'ex-assinatura',nome:'Histórico da assinatura',eventoCodigo:'RESUMO_USO_PLANO',contexto:'contrato',texto:'Olá, {{NOME_TUTOR}}!\n\nPlano: {{NOME_PLANO}}\nPet: {{NOME_PET}}\nUso no período: {{HISTORICO_USOS}}\nStatus: {{STATUS_ASSINATURA}}\n\nEquipe {{NOME_EMPRESA}} 🧡' },
  { id:'ex-cobranca',nome:'Aviso de inadimplência',eventoCodigo:'CLIENTE_ENTROU_INADIMPLENCIA',contexto:'financeiro',texto:'Olá, {{NOME_TUTOR}}! Identificamos uma pendência de {{REFERENCIA_COBRANCA}}, vencida em {{DATA_VENCIMENTO}}, no valor de {{VALOR_EM_ABERTO}}. Se já realizou o pagamento, desconsidere. Podemos ajudar? — {{NOME_EMPRESA}}' },
]
