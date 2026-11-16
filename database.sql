-- Ejecutar UNA VEZ en un proyecto Supabase nuevo, desde SQL Editor.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id), name text not null,
 role text not null check(role in ('interno','externo')),
 approval_limit numeric(14,2) not null default 0 check(approval_limit>=0)
);
create function public.is_internal() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles where id=auth.uid() and role='interno');
$$;
create table public.orders (
 id bigint generated always as identity primary key,
 creator_id uuid not null references public.profiles(id),
 supplier text not null check(length(trim(supplier)) between 1 and 120),
 department text not null check(length(trim(department)) between 1 and 80),
 description text not null check(length(trim(description)) between 1 and 500),
 amount numeric(14,2) not null check(amount>0 and amount<=999999999.99),
 currency text not null default 'GTQ' check(currency='GTQ'),
 status text not null default 'Borrador' check(status in ('Borrador','Pendiente de aprobación','Aprobada','Rechazada','Cerrada','Cancelada')),
 approver_id uuid not null references public.profiles(id),
 due_date date not null, submitted_at timestamptz, decided_at timestamptz,
 reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.approvals (
 id bigint generated always as identity primary key, order_id bigint not null references public.orders(id) on delete cascade,
 approver_id uuid not null references public.profiles(id), decision text not null check(decision in ('Aprobada','Rechazada')),
 reason text, limit_snapshot numeric(14,2) not null, decided_at timestamptz not null default now(),
 unique(order_id,approver_id)
);
create table public.audit_log (
 id bigint generated always as identity primary key, order_id bigint not null,
 actor_id uuid not null, operation text not null, old_values jsonb, new_values jsonb, occurred_at timestamptz not null default now()
);
create function public.log_order() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into audit_log(order_id,actor_id,operation,old_values,new_values)
 values(coalesce(new.id,old.id),auth.uid(),tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger order_audit after insert or update or delete on public.orders for each row execute function public.log_order();
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or role='interno' or public.is_internal());
create policy order_read on public.orders for select to authenticated using(creator_id=auth.uid() or public.is_internal());
create policy approval_read on public.approvals for select to authenticated using(public.is_internal() or exists(select 1 from public.orders o where o.id=order_id and o.creator_id=auth.uid()));
create policy audit_read on public.audit_log for select to authenticated using(public.is_internal());
-- Ningún cliente tiene INSERT/UPDATE/DELETE directo. Las funciones validan toda mutación.
revoke all on public.profiles,public.orders,public.approvals,public.audit_log from anon,authenticated;
grant select on public.profiles,public.orders,public.approvals,public.audit_log to authenticated;
create function public.save_order(p_id bigint,p_supplier text,p_department text,p_description text,p_amount numeric,p_due date,p_approver uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare v orders; result_id bigint;
begin
 if not exists(select 1 from profiles where id=auth.uid()) then raise exception 'Cuenta sin perfil habilitado'; end if;
 if p_supplier is null or length(trim(p_supplier)) not between 1 and 120 then raise exception 'Proveedor: ingresa entre 1 y 120 caracteres'; end if;
 if p_department is null or length(trim(p_department)) not between 1 and 80 then raise exception 'Departamento: ingresa entre 1 y 80 caracteres'; end if;
 if p_description is null or length(trim(p_description)) not between 1 and 500 then raise exception 'Descripción: ingresa entre 1 y 500 caracteres'; end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999.99 or p_amount<>round(p_amount,2) then raise exception 'Importe: usa un valor positivo con máximo dos decimales'; end if;
 if p_due is null or p_due<(now() at time zone 'America/Guatemala')::date then raise exception 'Fecha límite: no puede ser anterior a hoy'; end if;
 if not exists(select 1 from profiles where id=p_approver and role='interno' and approval_limit>0) then raise exception 'Aprobador: selecciona un interno con límite positivo'; end if;
 if p_id is null then
 insert into orders(creator_id,supplier,department,description,amount,due_date,approver_id) values(auth.uid(),trim(p_supplier),trim(p_department),trim(p_description),p_amount,p_due,p_approver) returning id into result_id;
 else
 select * into v from orders where id=p_id for update;
 if not found then raise exception 'Orden no encontrada'; end if;
 if not (v.creator_id=auth.uid() or is_internal()) then raise exception 'Acceso denegado'; end if;
 if v.status<>'Borrador' then raise exception 'Solo se puede modificar un borrador'; end if;
 update orders set supplier=trim(p_supplier),department=trim(p_department),description=trim(p_description),amount=p_amount,due_date=p_due,approver_id=p_approver,updated_at=now() where id=p_id;
 result_id:=p_id;
 end if;
 return result_id;
end $$;
create function public.order_action(p_id bigint,p_action text,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v orders; lim numeric; first_approval approvals; count_approvals integer;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 select * into v from orders where id=p_id for update;
 if not found then raise exception 'Orden no encontrada'; end if;
 if not(v.creator_id=auth.uid() or is_internal()) then raise exception 'Acceso denegado'; end if;
 if p_action='eliminar' then
 if v.status<>'Borrador' then raise exception 'Solo se elimina un borrador'; end if;
 delete from orders where id=p_id; return;
 elsif p_action='enviar' then
 if v.status<>'Borrador' then raise exception 'Solo se envía un borrador'; end if;
 if v.due_date<(now() at time zone 'America/Guatemala')::date then raise exception 'Actualiza la fecha límite antes de enviar'; end if;
 update orders set status='Pendiente de aprobación',submitted_at=now(),updated_at=now() where id=p_id;
 elsif p_action in ('aprobar','rechazar') then
 if not is_internal() then raise exception 'Solo un interno puede aprobar o rechazar'; end if;
 if v.creator_id=auth.uid() then raise exception 'No puedes aprobar tu propia orden'; end if;
 if v.status<>'Pendiente de aprobación' then raise exception 'La orden no está pendiente'; end if;
 select approval_limit into lim from profiles where id=auth.uid();
 if lim<=0 then raise exception 'No tienes límite de aprobación asignado'; end if;
 select * into first_approval from approvals where order_id=p_id and decision='Aprobada' order by decided_at limit 1;
 if first_approval.id is null and v.approver_id<>auth.uid() then raise exception 'Debe decidir primero el aprobador asignado'; end if;
 if exists(select 1 from approvals where order_id=p_id and approver_id=auth.uid()) then raise exception 'La segunda decisión requiere otro aprobador'; end if;
 if p_action='rechazar' and (p_reason is null or length(trim(p_reason)) not between 1 and 500) then raise exception 'Motivo: ingresa entre 1 y 500 caracteres para rechazar'; end if;
 insert into approvals(order_id,approver_id,decision,reason,limit_snapshot) values(p_id,auth.uid(),case when p_action='aprobar' then 'Aprobada' else 'Rechazada' end,case when p_action='rechazar' then trim(p_reason) end,lim);
 if p_action='rechazar' then
 update orders set status='Rechazada',reason=trim(p_reason),decided_at=now(),updated_at=now() where id=p_id;
 elsif first_approval.id is not null or v.amount<=lim then
 update orders set status='Aprobada',decided_at=now(),updated_at=now() where id=p_id;
 else
 -- La primera aprobación por encima del límite deja la orden pendiente.
 update orders set updated_at=now() where id=p_id;
 end if;
 elsif p_action='cerrar' then
 if not is_internal() or v.status<>'Aprobada' then raise exception 'Solo un interno puede cerrar una orden aprobada'; end if;
 update orders set status='Cerrada',updated_at=now() where id=p_id;
 elsif p_action='cancelar' then
 if v.status not in ('Borrador','Pendiente de aprobación','Aprobada') then raise exception 'Esta orden no se puede cancelar'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'Motivo: ingresa entre 1 y 500 caracteres para cancelar'; end if;
 update orders set status='Cancelada',reason=trim(p_reason),updated_at=now() where id=p_id;
 else raise exception 'Acción desconocida'; end if;
end $$;
revoke all on function public.save_order(bigint,text,text,text,numeric,date,uuid),public.order_action(bigint,text,text),public.is_internal(),public.log_order() from public,anon;
grant execute on function public.save_order(bigint,text,text,text,numeric,date,uuid),public.order_action(bigint,text,text),public.is_internal() to authenticated;
create index orders_creator on public.orders(creator_id);
create index orders_status on public.orders(status);
create index approvals_order on public.approvals(order_id);
commit;
