# Candidata comercial KAZA PET

Data da validação local: 25/11/2026. Base Git: 29a24ed3844084e578fea10e8a8ef1553a4e5b33.

O ZIP contém uma sobreposição de fontes para o checkout atual. Preserve os componentes de mensageria e WhatsApp existentes no destino. Arquivos de ambiente, chaves, cadastros fictícios e configuração de runtime local ficaram fora do ZIP.

## Sequência para implantação autorizada posteriormente

1. Confirme a cadeia comercial até 047 e a RPC public.mensageria_confirmar_agendamento(jsonb,uuid) com os privilégios esperados. Se faltar, avalie o SQL de confirmação integrada incluído na pasta banco/propostas/central-notificacoes e sua compatibilidade com a mensageria do destino. Na homologação local, essa dependência foi instalada antes de 048 e 049.
2. Execute 048 e depois 049. A 048 mantém as intenções idempotentes legadas e permite guardar dados de pet desconhecidos. A 049 separa adicionais e preserva valores anteriores. Ela pressupõe a RPC integrada e os privilégios diretos já existentes.
3. Atualize as Edges comerciais a partir das fontes correspondentes e publique o frontend pelo projeto existente, mantendo as variáveis do destino. Execute npm run build a partir de frontend.
4. Se precisar reverter interface e Edges, preserve registros gerados nesta versão. A reversão da DDL precisa considerar snapshots nulos, adicionais e recebimentos existentes. Evite remover objetos ou colunas que já tenham recebido dados.

## Evidências locais

- Venda semanal sem transporte em 07/12/2026 às 15h30 com quatro ocorrências materializadas.
- Venda quinzenal retroativa em 16/11/2026 com duas ocorrências e TaxiDog, coleta 08h a 08h30 e início previsto 08h30.
- Pacote de R$ 176,00 com quatro banhos e hidratações materializadas nas visitas 2 e 4.
- Primeira visita concluída com banho e tosa. Uma entrada antecipada de R$ 60,00 e consumo de um crédito de banho.
- Segunda visita remarcada para 10h15 e concluída com banho, hidratação e tosa. O ciclo já estava quitado. O único novo recebimento foi o adicional de R$ 60,00, registrado na conclusão.
- Um pagamento integral de R$ 176,00 para o ciclo inteiro. A terceira visita foi cancelada pelo pulo, deixou o crédito disponível e ficou sem recebimento.
- Avulso com valor original de R$ 60,00 e valor final de R$ 51,99.
- Auth, PostgREST, PostgreSQL e Edge Functions em Deno nativo na homologação existente. As gravações feitas pela interface foram conferidas em PostgreSQL em transação somente leitura.

O adicional precisa caber na agenda e ter suas dependências já presentes na reserva. Cancelar, registrar falta ou pular uma visita com adicional pago exige resolver esse recebimento primeiro. A remarcação preserva os valores registrados.
