-- KAZA PET | apenas homologação jgtctzqieyorhvqxjbpk.
-- Copiar versão de rascunho autenticado para catálogo PUBLICADO, mediante
-- ação explícita futura. Esta migração NÃO publica nenhum rascunho e NÃO envia mensagens.
begin;

create table if not exists public.mensageria_hml_publicacoes (
  id uuid primary key default gen_random_uuid(),
  rascunho_id uuid not null references public.mensageria_hml_editor_rascunhos(id) on delete restrict,
  versao_rascunho integer not null check (versao_rascunho>0),
  modelo_id uuid not null references public.mensageria_modelos(id) on delete restrict,
  versao_modelo_id uuid not null unique references public.mensageria_modelo_versoes(id) on delete restrict,
  operador_id uuid not null,
  chave_idempotencia uuid not null unique,
  hash_texto text not null check (hash_texto ~ '^[0-9a-f]{64}$'),
  publicado_em timestamptz not null default now(),
  unique(rascunho_id,versao_rascunho)
);
alter table public.mensageria_hml_publicacoes enable row level security;
revoke all on table public.mensageria_hml_publicacoes
  from public,anon,authenticated,service_role;

create or replace function public.mensageria_hml_publicar_modelo(
  p_operador uuid,p_rascunho uuid,p_versao_esperada integer,p_chave uuid
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog
as $function$
declare
  v_draft public.mensageria_hml_editor_rascunhos%rowtype;
  v_audit public.mensageria_hml_publicacoes%rowtype;
  v_modelo uuid;
  v_modelo_versao uuid;
  v_numero bigint;
  v_tag record;
  v_restante text;
begin
  if p_operador is null or p_rascunho is null or p_versao_esperada is null
    or p_chave is null or p_versao_esperada not between 1 and 1000000 then
    return jsonb_build_object('status','parametros_invalidos');
  end if;
  if not exists(select 1 from auth.users u where u.id=p_operador
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now())
    and u.raw_app_meta_data->>'role'='internal'
    and u.raw_app_meta_data->>'whatsapp_admin'='true') then
    return jsonb_build_object('status','operador_nao_autorizado');
  end if;

  -- Serializa publicações deste evento sem bloquear demais módulos.
  perform pg_advisory_xact_lock(hashtextextended(
    'hml:mensageria:publicar:AGENDAMENTO_CONFIRMADO_WHATSAPP',0));
  select * into v_audit from public.mensageria_hml_publicacoes
    where chave_idempotencia=p_chave;
  if found then
    if v_audit.operador_id=p_operador and v_audit.rascunho_id=p_rascunho
       and v_audit.versao_rascunho=p_versao_esperada then
       return jsonb_build_object('status','ja_publicado',
          'modelo_versao_id',v_audit.versao_modelo_id);
    end if;
    return jsonb_build_object('status','chave_reutilizada');
  end if;

  select * into v_draft from public.mensageria_hml_editor_rascunhos
    where id=p_rascunho for share;
  if not found or v_draft.operador_id<>p_operador
    or v_draft.excluido_em is not null
    or v_draft.versao<>p_versao_esperada then
    return jsonb_build_object('status','rascunho_indisponivel_ou_versao_alterada');
  end if;
  if v_draft.evento_codigo<>'AGENDAMENTO_CONFIRMADO_WHATSAPP'
     or v_draft.contexto<>'agenda' or length(btrim(v_draft.texto)) not between 1 and 4096
     or length(v_draft.texto)>4096 then
    return jsonb_build_object('status','evento_ou_texto_nao_habilitado');
  end if;
  if exists(select 1 from public.mensageria_hml_publicacoes
     where rascunho_id=p_rascunho and versao_rascunho=p_versao_esperada) then
    return jsonb_build_object('status','versao_ja_publicada');
  end if;

  -- Só as tags que o motor de resposta sabe preencher podem ser publicadas.
  for v_tag in select distinct m[1] as nome
      from regexp_matches(v_draft.texto,'\{([A-Z][A-Z0-9_]*)\}','g') m loop
    if v_tag.nome not in (
      'NOME_TUTOR','NOME_PET','NOME_EMPRESA',
      'DATA_AGENDAMENTO','HORARIO_AGENDAMENTO'
    ) then
      return jsonb_build_object('status','tag_nao_suportada');
    end if;
  end loop;
  if not(v_draft.texto like '%{NOME_TUTOR}%'
    and v_draft.texto like '%{NOME_PET}%'
    and v_draft.texto like '%{NOME_EMPRESA}%') then
    return jsonb_build_object('status','tags_obrigatorias_ausentes');
  end if;
  v_restante:=regexp_replace(v_draft.texto,
    '\{\{?[A-Z][A-Z0-9_]*\}\}?','','g');
  if position('{{' in v_restante)>0 or position('}}' in v_restante)>0
     or position('{LINK_REMARCACAO}' in v_draft.texto)>0 then
    return jsonb_build_object('status','placeholders_invalidos');
  end if;

  select id into v_modelo from public.mensageria_modelos
    where codigo='AGENDAMENTO_CONFIRMADO_WHATSAPP'
    for update;
  if not found then
    insert into public.mensageria_modelos(codigo,nome,contexto,ativo)
    values('AGENDAMENTO_CONFIRMADO_WHATSAPP',
      'Agradecimento de agendamento pelo WhatsApp','agenda',true)
    returning id into v_modelo;
  end if;
  if not exists(select 1 from public.mensageria_modelos
       where id=v_modelo and ativo and contexto='agenda') then
    return jsonb_build_object('status','modelo_desativado');
  end if;
  select coalesce(max(numero),0)+1 into v_numero
    from public.mensageria_modelo_versoes where modelo_id=v_modelo;
  update public.mensageria_modelo_versoes
    set estado='arquivada' where modelo_id=v_modelo and estado='publicada';
  insert into public.mensageria_modelo_versoes(
    modelo_id,numero,estado,texto,criado_por)
  values(v_modelo,v_numero,'publicada',v_draft.texto,p_operador)
  returning id into v_modelo_versao;
  insert into public.mensageria_hml_publicacoes(
    rascunho_id,versao_rascunho,modelo_id,versao_modelo_id,
    operador_id,chave_idempotencia,hash_texto)
  values(p_rascunho,p_versao_esperada,v_modelo,v_modelo_versao,
    p_operador,p_chave,encode(sha256(convert_to(v_draft.texto,'UTF8')),'hex'));
  return jsonb_build_object(
    'status','publicado','codigo','AGENDAMENTO_CONFIRMADO_WHATSAPP',
    'numero_versao',v_numero,'modelo_versao_id',v_modelo_versao);
end;
$function$;

revoke all on function public.mensageria_hml_publicar_modelo(uuid,uuid,integer,uuid)
  from public,anon,authenticated;
grant execute on function public.mensageria_hml_publicar_modelo(uuid,uuid,integer,uuid)
  to service_role;
commit;
