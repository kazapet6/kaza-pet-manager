-- KAZA PET | Somente Supabase HML. Fila em modo leitura; sem writes, sends ou cron.
-- Nenhuma função exposta a authenticated/anon: uso exclusivo backend admin.
create or replace function public.mensageria_hml_outbox_listar_pendentes(
  p_operador uuid,
  p_limite integer default 5
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog
as $body$
declare
  v_itens jsonb;
begin
  if p_operador is null or not exists (
    select 1 from auth.users u where u.id=p_operador
       and u.deleted_at is null
       and (u.banned_until is null or u.banned_until<=now())
       and u.raw_app_meta_data->>'role'='internal'
       and u.raw_app_meta_data->>'whatsapp_admin'='true'
  ) then
    return jsonb_build_object('status','nao_autorizado');
  end if;
  if p_limite is null or p_limite not between 1 and 10 then
    return jsonb_build_object('status','limite_invalido');
  end if;

  select coalesce(jsonb_agg(x.id order by x.criado_em,x.id),'[]'::jsonb)
  into v_itens
  from (
    select o.id,o.criado_em
    from public.mensageria_hml_respostas_outbox o
    join public.mensageria_hml_convites_confirmacao c
      on c.id=o.convite_id and c.atendimento_id=o.atendimento_id
      and c.estado='confirmado'
    join public.atendimentos a
      on a.id=o.atendimento_id and a.status='confirmado'
      and a.grupo_agendamento_id=c.grupo_id
      and a.inicio_planejado is not distinct from c.inicio_snapshot
      and a.inicio_planejado>now()
    join public.grupos_agendamento g
      on g.id=c.grupo_id
      and g.cliente_id='CLI-990003'
      and g.horario_chegada_comprometido is not distinct from c.chegada_snapshot
    join mensageria_interna.agenda_grupos ag
      on ag.grupo_id=g.id and ag.cliente_id=g.cliente_id
      and ag.empresa_id=c.empresa_id and ag.unidade_id=c.unidade_id
    join mensageria_interna.unidades un
      on un.empresa_id=ag.empresa_id and un.unidade_id=ag.unidade_id
      and un.confirmacao_ativa=true
    join public.mensageria_modelo_versoes v
      on v.id=o.modelo_versao_id and v.estado='publicada'
    join public.mensageria_modelos m
      on m.id=v.modelo_id and m.codigo=o.evento_codigo
      and m.ativo=true and m.contexto='agenda'
    where o.estado='pronto'
      and o.evento_codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP'
      and c.meta_waba_id='377176189908880'
      and c.meta_phone_number_id='309132033809134'
      and c.destinatario_e164 = (
        select '+'||regexp_replace(cli.whatsapp,'[^0-9]','','g')
        from public.clientes cli where cli.id=g.cliente_id
      )
      and exists (
        select 1 from public.mensageria_hml_convite_processamentos p
        where p.convite_id=c.id and p.acao='confirmar'
          and p.resultado='confirmado'
      )
      and not exists (
        select 1 from public.mensageria_hml_respostas_tentativas t
        where t.outbox_id=o.id
      )
    order by o.criado_em,o.id
    limit p_limite
  ) x;
  return jsonb_build_object('status','ok','itens',v_itens,'quantidade',jsonb_array_length(v_itens));
end;
$body$;

revoke all on function public.mensageria_hml_outbox_listar_pendentes(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_outbox_listar_pendentes(uuid,integer)
  to service_role;
