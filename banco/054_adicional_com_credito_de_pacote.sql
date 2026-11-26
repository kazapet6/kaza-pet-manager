begin;
alter table public.servicos
  add column exige_credito_de_servico_id uuid references public.servicos(id) on delete restrict,
  add constraint servico_credito_distinto check (exige_credito_de_servico_id <> id);

create function public.validar_adicional_com_credito_054()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare
  requisito uuid;
  preco numeric;
begin
  if not new.ativo then return new; end if;
  select exige_credito_de_servico_id, preco_base into requisito, preco
    from public.servicos where id = new.servico_id;
  if requisito is null then return new; end if;
  if not new.adicional_pacote or not exists (
    select 1 from public.contrato_creditos_contexto_044 c
    where c.atendimento_atual_id = new.atendimento_id
      and c.servico_id = requisito and c.estado_comercial = 'reservado'
      and c.status_atendimento in ('agendado','confirmado')
  ) then
    raise exception 'Este adicional exige um crédito do serviço de pacote reservado para o atendimento.' using errcode = 'P0054';
  end if;
  if new.valor_final is distinct from preco then
    raise exception 'O valor do adicional difere do preço configurado.' using errcode = 'P0054';
  end if;
  return new;
end;
$$;
revoke all on function public.validar_adicional_com_credito_054() from public, anon, authenticated;
grant execute on function public.validar_adicional_com_credito_054() to service_role;
create trigger validar_adicional_com_credito_054
before insert or update of servico_id, atendimento_id, ativo, adicional_pacote, valor_final
on public.atendimento_servicos for each row execute function public.validar_adicional_com_credito_054();
notify pgrst, 'reload schema';
commit;
