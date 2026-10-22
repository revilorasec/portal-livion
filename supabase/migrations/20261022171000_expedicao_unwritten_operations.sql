begin;
alter table public.expedicao_operations drop constraint expedicao_operations_state_check;
alter table public.expedicao_operations add constraint expedicao_operations_state_check
 check(state in ('PREPARED','DISPATCHED','PENDING','CONFIRMED','NOT_WRITTEN'));

create or replace function public.expedicao_finish_operation(p_id uuid,p_state text,p_result jsonb,p_actor text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare op public.expedicao_operations;
begin
 if p_state not in ('CONFIRMED','PENDING','NOT_WRITTEN') then raise exception 'INVALID'; end if;
 select * into strict op from public.expedicao_operations where id=p_id for update;
 if op.state in ('CONFIRMED','NOT_WRITTEN') then return to_jsonb(op); end if;
 if op.state not in ('DISPATCHED','PENDING') then raise exception 'INVALID'; end if;
 if p_state='NOT_WRITTEN' and (
   op.updated_at > now()-interval '10 minutes'
   or (p_result->>'readOnlyCheck') is distinct from 'true'
   or (p_result->>'unchanged')::integer is distinct from jsonb_array_length(op.updates)
   or jsonb_array_length(op.updates)=0
 ) then raise exception 'CONFLICT'; end if;
 update public.expedicao_operations set state=p_state,result=p_result,updated_at=now() where id=p_id returning * into op;
 insert into public.expedicao_events(client,group_key,action,actor_email,detail)
 values(op.client,op.group_key,'BOXES_'||p_state,p_actor,jsonb_build_object('operationId',op.id,'result',p_result));
 return to_jsonb(op);
end $$;
revoke all on function public.expedicao_finish_operation(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.expedicao_finish_operation(uuid,text,jsonb,text) to service_role;
commit;
