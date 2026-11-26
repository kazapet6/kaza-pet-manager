-- HML only: install a dry-run scheduler. This job makes NO HTTP calls.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('kazapet-hml-lembretes-simulacao','* * * * *','SELECT mensageria_interna.executar_simulacao_lembretes_hml()');