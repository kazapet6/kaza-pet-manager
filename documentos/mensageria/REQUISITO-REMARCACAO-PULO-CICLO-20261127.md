# Regra comercial — remarcação e pulo de banho em contratos

Definição do proprietário em 27/11/2026. Substitui o comportamento do pulo 046 que cancela o atendimento e disponibiliza crédito para reaproveitamento. Esta documentação não implanta a regra.

## Remarcar
- Para atendimento vinculado a pacote, somente dentro da mesma semana do compromisso vigente.
- Premissa de implementação a verificar: semana civil local de segunda a domingo (America/Sao_Paulo), sujeita aos dias de funcionamento e exceções do estabelecimento.
- Alterar exclusivamente a ocorrência escolhida, sem modificar a rotina fixa contratual, os demais atendimentos, a composição dos serviços, o valor ou a quantidade de créditos.
- Preservar os créditos reservados associados à ocorrência; não criar crédito disponível nem exigir reaproveitamento.
- Usar o motor de disponibilidade e a proteção transacional também no backend; não confiar apenas no filtro de datas do frontend.
- Se a nova data ficar fora da semana, orientar o operador a usar Pular banho. Agendamentos avulsos não recebem essa restrição por esta definição.

## Pular banho
- Transferir a ocorrência para o dia fixo contratado na semana seguinte; recalcular as ocorrências subsequentes ainda não realizadas na ordem original.
- Preservar a periodicidade contratada entre as ocorrências subsequentes. Para o quinzenal, interpretação a validar nos testes: primeiro deslocamento para a semana seguinte (+7 dias no calendário), demais espaçamentos de 14 dias preservados.
- Preservar horário/modalidade fixa, TaxiDog (horário da coleta), composição individual dos serviços e hidratações, valor e situação financeira, identidade e quantidade das unidades comerciais reservadas.
- Não criar crédito disponível, perdido ou adicional; não cancelar e liberar créditos para reaproveitamento manual como resultado do pulo.
- Preservar atendimentos anteriores/concluídos e histórico. Não reabrir atendimento concluído nem modificar pagamento já registrado. Se houver adicionais recebidos ou outro impedimento, bloquear de modo seguro e explicar.
- Manter limite de dois pulos comuns por ciclo e terceiro ou posterior com autorização administrativa, conforme regra anterior.
- Recalcular o término do ciclo e a referência da renovação automática.
- Planejar toda a nova sequência no motor de disponibilidade, descontando as reservas das ocorrências que serão movidas e considerando as novas reservas entre si. Gravar em uma única transação, com bloqueio comercial, versões de configuração e ocupação e idempotência. Se qualquer ocorrência não puder ser planejada, não gravar mudanças parciais.
- Registrar evento de pulo e histórico de datas sem disparar mensagens indevidas.

## Critérios de aceitação
1. Semanal terças 01,08,15,22/12: remarcação de 01 para 02/12 preserva 08,15,22/12; rejeitar 08/12 como remarcação de 01/12.
2. Mesmo ciclo: pular 01/12 produz 08,15,22,29/12, preservando quatro banhos, distribuição de hidratações e créditos reservados.
3. Pular depois de remarcação de terça para quarta: retornar ao dia fixo terça da semana seguinte.
4. Pular ocorrência intermediária: anteriores intactas; deslocar apenas ocorrência escolhida e posteriores não realizadas.
5. Quinzenal: preservar periodicidade de 14 dias entre ocorrências, sem transformar em semanal.
6. Repetir a mesma requisição não desloca duas vezes; duas operações concorrentes não produzem sobreposição nem duplicação.
7. Conflito de recurso/feriado no destino: nenhuma alteração parcial; informar conflito.
8. Terceiro pulo exige autorização administrativa; tentativa negada não muda agenda nem contador.
9. Renovação gerada após concluir sequência recalculada, com novo ciclo pendente de pagamento.
10. Sem crédito disponível por remarcação ou pulo; cancelamento comum segue fluxo comercial separado até nova definição.
11. Validar versão HML com dados fictícios e preservar produção e mensageria. O pulo já realizado durante teste antigo deve ser tratado como fixture anterior, sem fabricar histórico ou reescrever dados sem validação.

## Situação
Requisito registrado. Implementação, migração, deploy e testes ponta a ponta ainda pendentes. Não continuar testes de pulo com a regra antiga.
