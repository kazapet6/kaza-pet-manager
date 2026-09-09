# BACKLOG - KAZA PET Manager

## Alta prioridade

- [x] Cadastro de Clientes
- [x] Cadastro de Pets
- [x] Cabeçalho autoritativo de Pacotes (migration 026 aplicada)
- [x] Composição, recorrência calendárica e comparação de preços de Pacotes (migration 027 aplicada e E2E aprovado)
- [x] Contratos — fundação relacional e snapshots comerciais (migration 028 aplicada)
- [x] Contratos — venda/configuração autoritativa (migration 029 aplicada, Edges publicadas e E2E aprovado)
- [x] Pacotes — desconto percentual sobre preço avulso autoritativo e Ciclos finitos (migration 030 aplicada)
- [x] Contratos — materialização operacional das ocorrências (migration 031 aplicada e fluxo B+H/B/B+H/B validado)
- [ ] Contratos — ciclo de vida autoritativo dos créditos e encerramento de Ciclo (migration 032 e Edge locais; aguardam aplicação, publicação e E2E)
- [x] Agenda inteligente — núcleo operacional encerrado
- [ ] Financeiro
- [ ] Inadimplentes

## Agenda — encerramento do núcleo operacional

- [x] criação e confirmação transacional de atendimento individual;
- [x] disponibilidade, precificação, dependências, equipe e equipamentos;
- [x] fluxo sem transporte e TaxiDog;
- [x] status operacionais, timestamps autoritativos e ações rápidas;
- [x] cancelamento, falta e remarcação com concorrência;
- [x] observações e ocorrências com versão própria;
- [x] conclusão guiada com pagamento, isenção e recomendação de retorno;
- [x] situação financeira na Agenda;
- [x] E2E remoto de atendimento individual com pagamento integral e retorno.

Melhorias futuras, sem bloqueio do núcleo atual:

- [ ] reduzir o tempo de recarga financeira da Agenda, hoje com uma chamada por atendimento;
- [ ] sincronizar o indicador financeiro do card imediatamente após um recebimento no modal;
- [ ] transformar o planejador em lote de múltiplos pets, hoje restrito à ferramenta DEV, em fluxo produtivo quando Pacotes/Contratos definirem o contrato de confirmação em lote;
- [ ] executar E2E específico do fluxo TaxiDog e dos fluxos excepcionais de cancelamento, falta e remarcação.

## Média prioridade

- [ ] Estoque
- [ ] Compras
- [ ] Custos
- [ ] Funcionários
- [ ] Relatórios

## Baixa prioridade

- [ ] Portal do Cliente
- [ ] Compra online de contratos
- [ ] Agendamento online
- [ ] Integração WhatsApp
- [ ] Dashboard com IA

## Ideias
- [ ] UI de resolução de Ciclo `requer_revisao` com alternativas autoritativas e ação “Resolver horário”.
- [ ] Renovação manual “Renovar pacote”, com preço atual, disponibilidade atual e ajuste comercial autorizado.
- [ ] Financeiro completo de Ciclos e pendências administrativas no Dashboard.
- [ ] RBAC definitivo Administrador × Funcionário; até lá, manter ações sensíveis na fronteira interna existente.
## Evolução futura — Financeiro

- Faturamento projetado do dia baseado em obrigações financeiras/vencimentos autoritativos. Consolidar avulsos e ciclos sem duplicar receita nem somar valores de referência dos atendimentos de pacote. Não calcular este KPI na Agenda até existir essa fonte.
