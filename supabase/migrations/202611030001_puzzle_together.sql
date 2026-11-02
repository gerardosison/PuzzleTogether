-- PuzzleTogether: authenticated membership, private realtime, and atomic puzzle state.
-- Apply in a Supabase project with anonymous sign-in enabled.
create extension if not exists pgcrypto with schema extensions;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  host_user_id uuid not null references auth.users(id),
  status text not null default 'lobby' check (status in ('lobby','playing','completed','closed')),
  difficulty text not null default 'easy' check (difficulty in ('easy','medium','hard')),
  image_path text not null default '/art/starry-night.jpg',
  max_players integer not null default 6 check (max_players between 2 and 6),
  current_game_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  nickname text not null check (char_length(nickname) between 2 and 20 and nickname !~ '[[:cntrl:]]'),
  is_ready boolean not null default false,
  is_member_active boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  unique(room_id,user_id)
);
create index room_players_user_idx on public.room_players(user_id,room_id);
create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  image_path text not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  rows integer not null check (rows in (3,6,10)),
  columns integer not null check (columns in (4,8,12)),
  total_pieces integer not null check (total_pieces in (12,48,120)),
  completed_pieces integer not null default 0 check (completed_pieces >= 0 and completed_pieces <= total_pieces),
  generation_seed text not null default encode(extensions.gen_random_bytes(16),'hex'),
  status text not null default 'playing' check (status in ('playing','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  check ((rows=3 and columns=4 and total_pieces=12 and difficulty='easy') or (rows=6 and columns=8 and total_pieces=48 and difficulty='medium') or (rows=10 and columns=12 and total_pieces=120 and difficulty='hard'))
);
alter table public.rooms add constraint rooms_current_game_fk foreign key(current_game_id) references public.games(id) on delete set null;
create index games_room_idx on public.games(room_id);
create table public.puzzle_pieces (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  piece_index integer not null check (piece_index between 0 and 119),
  correct_x double precision not null,
  correct_y double precision not null,
  current_x double precision not null default -1,
  current_y double precision not null default -1,
  is_placed boolean not null default false,
  locked_by uuid references auth.users(id),
  lock_expires_at timestamptz,
  placed_by uuid references auth.users(id),
  placed_at timestamptz,
  version bigint not null default 0,
  unique(game_id,piece_index),
  check (correct_x >= 0 and correct_x < 1 and correct_y >= 0 and correct_y < 1)
);
create index puzzle_pieces_room_idx on public.puzzle_pieces(room_id);
create index rooms_expiry_idx on public.rooms(expires_at);

-- Definer helper avoids recursive RLS checks. It never accepts a user identity.
create function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.room_players p join public.rooms r on r.id=p.room_id
    where p.room_id=p_room_id and p.user_id=auth.uid() and p.is_member_active
      and r.expires_at > now() and r.status <> 'closed'
  );
$$;
create function public.require_nickname(p_value text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or char_length(btrim(p_value)) not between 2 and 20 or p_value ~ '[[:cntrl:]]' then
    raise exception 'Use a nickname of 2–20 characters without control characters.';
  end if;
  return btrim(p_value);
end;
$$;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.games enable row level security;
alter table public.puzzle_pieces enable row level security;
create policy room_member_read on public.rooms for select to authenticated using(public.is_room_member(id));
create policy player_member_read on public.room_players for select to authenticated using(public.is_room_member(room_id));
create policy game_member_read on public.games for select to authenticated using(public.is_room_member(room_id));
create policy piece_member_read on public.puzzle_pieces for select to authenticated using(public.is_room_member(room_id));
revoke all on public.rooms,public.room_players,public.games,public.puzzle_pieces from anon,authenticated;
grant select on public.rooms,public.room_players,public.games,public.puzzle_pieces to authenticated;

-- One MVCC statement returns a consistent room/game/piece snapshot under RLS.
create function public.get_room_snapshot(p_code text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'room',to_jsonb(r),
    'players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.joined_at),'[]'::jsonb) from public.room_players p where p.room_id=r.id),
    'game',(select to_jsonb(g) from public.games g where g.id=r.current_game_id),
    'pieces',(select coalesce(jsonb_agg(to_jsonb(p) order by p.piece_index),'[]'::jsonb) from public.puzzle_pieces p where p.game_id=r.current_game_id)
  ) from public.rooms r where r.code=upper(btrim(p_code));
$$;

create function public.create_room(p_nickname text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_name text:=public.require_nickname(p_nickname); v_code text; v_id uuid; v_bytes bytea; v_attempt integer; i integer;
begin
  if v_uid is null then raise exception 'Sign in as a guest before creating a room.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  if (select count(*) from public.rooms where host_user_id=v_uid and expires_at>now() and status<>'closed') >= 10 then raise exception 'You already have 10 open rooms. Leave an older room first.'; end if;
  for v_attempt in 1..8 loop
    v_code:=''; v_bytes:=extensions.gen_random_bytes(6);
    for i in 0..5 loop v_code:=v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',(get_byte(v_bytes,i)%32)+1,1); end loop;
    begin
      insert into public.rooms(code,host_user_id) values(v_code,v_uid) returning id into v_id;
      insert into public.room_players(room_id,user_id,nickname) values(v_id,v_uid,v_name);
      return v_code;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'Could not reserve a room code. Please try again.';
end;
$$;

create function public.join_room(p_code text,p_nickname text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_name text:=public.require_nickname(p_nickname); v_room public.rooms; v_existing public.room_players;
begin
  if v_uid is null then raise exception 'Sign in as a guest before joining a room.'; end if;
  if p_code is null or upper(btrim(p_code)) !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then raise exception 'Enter the six-character room code from your host.'; end if;
  select * into v_room from public.rooms where code=upper(btrim(p_code)) for update;
  if not found then raise exception 'No room uses that code. Check it with your host.'; end if;
  if v_room.expires_at<=now() then raise exception 'This room has expired. Ask your host to create a new one.'; end if;
  if v_room.status='closed' then raise exception 'This room is closed.'; end if;
  select * into v_existing from public.room_players where room_id=v_room.id and user_id=v_uid;
  if found and v_existing.is_member_active then
    update public.room_players set nickname=v_name,last_seen_at=now() where id=v_existing.id;
    return v_room.code;
  end if;
  if v_room.status<>'lobby' then raise exception 'This puzzle has already started. New players can join the next round.'; end if;
  if (select count(*) from public.room_players where room_id=v_room.id and is_member_active)>=v_room.max_players then raise exception 'This room is full (six players maximum).'; end if;
  insert into public.room_players(room_id,user_id,nickname) values(v_room.id,v_uid,v_name)
    on conflict(room_id,user_id) do update set nickname=excluded.nickname,is_member_active=true,is_ready=false,left_at=null,last_seen_at=now();
  return v_room.code;
end;
$$;

create function public.update_room_settings(p_room_id uuid,p_image_path text,p_difficulty text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or v_room.host_user_id is distinct from auth.uid() or not public.is_room_member(p_room_id) then raise exception 'Only this room’s host can change the puzzle.'; end if;
  if v_room.status<>'lobby' then raise exception 'Choose the next artwork in the lobby.'; end if;
  if p_difficulty is null or p_difficulty not in ('easy','medium','hard') then raise exception 'Choose a supported difficulty.'; end if;
  if p_image_path is null or not (
    p_image_path in ('/art/starry-night.jpg','/art/wave.jpg','/art/shipwreck.jpg','/art/olive-trees.jpg','/art/houses.jpg','/art/udnie.jpg','/art/night-cafe.jpg','/art/self-portrait.jpg','/art/scream.jpg','/art/wheat-field.jpg') or
    (p_image_path ~ ('^' || p_room_id::text || '/[a-f0-9-]+\.(jpg|webp|png)$') and exists(select 1 from storage.objects where bucket_id='puzzle-images' and name=p_image_path))
  ) then raise exception 'Choose an artwork from the gallery or upload a supported image to this room.'; end if;
  update public.rooms set image_path=p_image_path,difficulty=p_difficulty,updated_at=now() where id=p_room_id;
  update public.room_players set is_ready=false where room_id=p_room_id;
end;
$$;

create function public.set_player_ready(p_room_id uuid,p_ready boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.rooms where id=p_room_id for update;
  if not public.is_room_member(p_room_id) then raise exception 'Join this room first.'; end if;
  if v_status<>'lobby' then raise exception 'This round has already started.'; end if;
  update public.room_players set is_ready=coalesce(p_ready,false),last_seen_at=now() where room_id=p_room_id and user_id=auth.uid();
end;
$$;

create function public.start_game(p_room_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms; v_id uuid; v_rows integer; v_cols integer;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or v_room.host_user_id is distinct from auth.uid() or not public.is_room_member(p_room_id) then raise exception 'Only this room’s host can start the puzzle.'; end if;
  if v_room.status<>'lobby' then raise exception 'The room is not in its lobby.'; end if;
  if (select count(*) from public.room_players where room_id=p_room_id and is_member_active)<2 then raise exception 'Invite at least one other player, or try solo play.'; end if;
  if exists(select 1 from public.room_players where room_id=p_room_id and is_member_active and user_id<>v_room.host_user_id and not is_ready) then raise exception 'Wait for every guest to be ready.'; end if;
  v_rows:=case v_room.difficulty when 'easy' then 3 when 'medium' then 6 else 10 end;
  v_cols:=case v_room.difficulty when 'easy' then 4 when 'medium' then 8 else 12 end;
  insert into public.games(room_id,image_path,difficulty,rows,columns,total_pieces)
    values(p_room_id,v_room.image_path,v_room.difficulty,v_rows,v_cols,v_rows*v_cols) returning id into v_id;
  insert into public.puzzle_pieces(room_id,game_id,piece_index,correct_x,correct_y)
    select p_room_id,v_id,i,(i%v_cols)::double precision/v_cols,(i/v_cols)::double precision/v_rows from generate_series(0,v_rows*v_cols-1) i;
  update public.rooms set status='playing',current_game_id=v_id,updated_at=now() where id=p_room_id;
  return v_id;
end;
$$;

create function public.claim_piece(p_game_id uuid,p_index integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_game public.games; v_changed integer;
begin
  -- Lock order is room -> game -> piece for every mutating operation.
  perform 1 from public.rooms where id=(select room_id from public.games where id=p_game_id) for update;
  select * into v_game from public.games where id=p_game_id for update;
  if not found or not public.is_room_member(v_game.room_id) then raise exception 'Join this room before moving pieces.'; end if;
  if v_game.status<>'playing' or not exists(select 1 from public.rooms where id=v_game.room_id and current_game_id=p_game_id and status='playing') then return false; end if;
  update public.puzzle_pieces set locked_by=auth.uid(),lock_expires_at=now()+interval '10 seconds',version=version+1
    where game_id=p_game_id and piece_index=p_index and not is_placed
      and (locked_by is null or lock_expires_at<=now() or locked_by=auth.uid());
  get diagnostics v_changed=row_count;
  return v_changed=1;
end;
$$;

create function public.renew_piece_lock(p_game_id uuid,p_index integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_game public.games; v_changed integer;
begin
  -- Lock order is room -> game -> piece for every mutating operation.
  perform 1 from public.rooms where id=(select room_id from public.games where id=p_game_id) for update;
  select * into v_game from public.games where id=p_game_id for update;
  if not found or not public.is_room_member(v_game.room_id) then raise exception 'Room membership is required.'; end if;
  if v_game.status<>'playing' or not exists(select 1 from public.rooms where id=v_game.room_id and current_game_id=p_game_id and status='playing') then return false; end if;
  update public.puzzle_pieces set lock_expires_at=now()+interval '10 seconds',version=version+1
    where game_id=p_game_id and piece_index=p_index and not is_placed and locked_by=auth.uid() and lock_expires_at>now();
  get diagnostics v_changed=row_count;
  return v_changed=1;
end;
$$;

create function public.release_piece(p_game_id uuid,p_index integer,p_x double precision,p_y double precision) returns void
language plpgsql security definer set search_path = '' as $$
declare v_game public.games;
begin
  -- Lock order is room -> game -> piece for every mutating operation.
  perform 1 from public.rooms where id=(select room_id from public.games where id=p_game_id) for update;
  select * into v_game from public.games where id=p_game_id for update;
  if not found or not public.is_room_member(v_game.room_id) then raise exception 'Room membership is required.'; end if;
  if p_x is null or p_y is null or not (p_x between -4 and 4 and p_y between -4 and 4) then raise exception 'Invalid piece position.'; end if;
  update public.puzzle_pieces set current_x=p_x,current_y=p_y,locked_by=null,lock_expires_at=null,version=version+1
    where game_id=p_game_id and piece_index=p_index and locked_by=auth.uid() and lock_expires_at>now() and not is_placed;
end;
$$;

create function public.place_piece(p_game_id uuid,p_index integer,p_x double precision,p_y double precision) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_game public.games; v_piece public.puzzle_pieces; v_count integer;
begin
  -- Lock order is room -> game -> piece for every mutating operation.
  perform 1 from public.rooms where id=(select room_id from public.games where id=p_game_id) for update;
  select * into v_game from public.games where id=p_game_id for update;
  if not found or not public.is_room_member(v_game.room_id) then raise exception 'Room membership is required.'; end if;
  select * into v_piece from public.puzzle_pieces where game_id=p_game_id and piece_index=p_index for update;
  if not found then raise exception 'This piece does not belong to this puzzle.'; end if;
  if not exists(select 1 from public.rooms where id=v_game.room_id and current_game_id=p_game_id) then return false; end if;
  if v_piece.is_placed then return true; end if; -- Retried placements never award a second contribution.
  if v_game.status<>'playing' or v_piece.locked_by is distinct from auth.uid() or v_piece.lock_expires_at<=now() then return false; end if;
  if p_x is null or p_y is null or not (p_x between -1 and 2 and p_y between -1 and 2) then return false; end if;
  if power(p_x-v_piece.correct_x,2)+power(p_y-v_piece.correct_y,2)>power(0.035,2) then return false; end if;
  update public.puzzle_pieces set is_placed=true,current_x=correct_x,current_y=correct_y,placed_by=auth.uid(),placed_at=now(),locked_by=null,lock_expires_at=null,version=version+1 where id=v_piece.id;
  v_count:=v_game.completed_pieces+1;
  update public.games set completed_pieces=v_count,version=version+1,
    status=case when v_count=total_pieces then 'completed' else 'playing' end,
    completed_at=case when v_count=total_pieces then now() else null end where id=p_game_id;
  if v_count=v_game.total_pieces then update public.rooms set status='completed',updated_at=now() where id=v_game.room_id; end if;
  return true;
end;
$$;

-- Completion is derived from the actual immutable placed rows, never a client count.
create function public.complete_game(p_game_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_game public.games; v_count integer;
begin
  -- Lock order is room -> game -> piece for every mutating operation.
  perform 1 from public.rooms where id=(select room_id from public.games where id=p_game_id) for update;
  select * into v_game from public.games where id=p_game_id for update;
  if not found or not public.is_room_member(v_game.room_id) then raise exception 'Room membership is required.'; end if;
  if not exists(select 1 from public.rooms where id=v_game.room_id and current_game_id=p_game_id) then return false; end if;
  select count(*) into v_count from public.puzzle_pieces where game_id=p_game_id and is_placed;
  if v_count<>v_game.total_pieces then return false; end if;
  update public.games set completed_pieces=v_count,status='completed',completed_at=coalesce(completed_at,now()),version=version+1 where id=p_game_id;
  update public.rooms set status='completed',updated_at=now() where id=v_game.room_id;
  return true;
end;
$$;

create function public.start_new_round(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or v_room.host_user_id is distinct from auth.uid() or not public.is_room_member(p_room_id) then raise exception 'Only the host can prepare another round.'; end if;
  if v_room.status<>'completed' then raise exception 'Finish this puzzle before starting a new round.'; end if;
  update public.rooms set status='lobby',current_game_id=null,updated_at=now() where id=p_room_id;
  update public.room_players set is_ready=false where room_id=p_room_id;
end;
$$;

create function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms; v_next uuid;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or not public.is_room_member(p_room_id) then raise exception 'You are not an active member of this room.'; end if;
  update public.room_players set is_member_active=false,is_ready=false,left_at=now() where room_id=p_room_id and user_id=auth.uid();
  update public.puzzle_pieces set locked_by=null,lock_expires_at=null,version=version+1 where room_id=p_room_id and locked_by=auth.uid() and not is_placed;
  if v_room.host_user_id=auth.uid() then
    select user_id into v_next from public.room_players where room_id=p_room_id and is_member_active order by joined_at,user_id limit 1;
    if v_next is null then update public.rooms set status='closed',updated_at=now() where id=p_room_id;
    else update public.rooms set host_user_id=v_next,updated_at=now() where id=p_room_id; end if;
  end if;
end;
$$;

-- Connected clients call every 20 s. A vanished host has a 90 s grace period.
create function public.heartbeat_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_room public.rooms; v_next uuid;
begin
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or not public.is_room_member(p_room_id) then raise exception 'Room membership is required.'; end if;
  update public.room_players set last_seen_at=now() where room_id=p_room_id and user_id=auth.uid();
  if not exists(select 1 from public.room_players where room_id=p_room_id and user_id=v_room.host_user_id and is_member_active and last_seen_at>now()-interval '90 seconds') then
    select user_id into v_next from public.room_players where room_id=p_room_id and is_member_active and last_seen_at>now()-interval '45 seconds' order by joined_at,user_id limit 1;
    if v_next is not null then update public.rooms set host_user_id=v_next,updated_at=now() where id=p_room_id; end if;
  end if;
end;
$$;

-- Private storage: access is scoped to active room members and host-only uploads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('puzzle-images','puzzle-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy puzzle_image_member_read on storage.objects for select to authenticated using (
  bucket_id='puzzle-images' and exists(select 1 from public.rooms r where r.id::text=(storage.foldername(name))[1] and public.is_room_member(r.id))
);
create policy puzzle_image_host_insert on storage.objects for insert to authenticated with check (
  bucket_id='puzzle-images' and name ~ '^[a-f0-9-]+/[a-f0-9-]+\.(jpg|png|webp)$' and exists(select 1 from public.rooms r where r.id::text=(storage.foldername(name))[1] and r.host_user_id=auth.uid() and r.status='lobby' and public.is_room_member(r.id))
);
create policy puzzle_image_host_delete on storage.objects for delete to authenticated using (
  bucket_id='puzzle-images' and exists(select 1 from public.rooms r where r.id::text=(storage.foldername(name))[1] and r.host_user_id=auth.uid() and public.is_room_member(r.id))
);

-- Both Presence and Broadcast use the same private room channel authorization.
create function public.can_use_room_topic(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_topic is null or p_topic !~ '^room:[a-f0-9-]{36}:game$' then return false; end if;
  begin v_id:=split_part(p_topic,':',2)::uuid; exception when invalid_text_representation then return false; end;
  return public.is_room_member(v_id);
end;
$$;
create policy room_realtime_read on realtime.messages for select to authenticated using(public.can_use_room_topic(realtime.topic()));
create policy room_realtime_write on realtime.messages for insert to authenticated with check(public.can_use_room_topic(realtime.topic()));

-- Functions are not PUBLIC entry points. Only these exact application functions are granted.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
    'is_room_member','require_nickname','get_room_snapshot','create_room','join_room','update_room_settings','set_player_ready','start_game','claim_piece','renew_piece_lock','release_piece','place_piece','complete_game','start_new_round','leave_room','heartbeat_room','can_use_room_topic'
  ) loop
    execute format('revoke all on function %s from public,anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end;
$$;

-- Durable canonical updates are streamed under the SELECT membership policies.
do $$
declare v_table text;
begin
  foreach v_table in array array['rooms','room_players','games','puzzle_pieces'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
end;
$$;
