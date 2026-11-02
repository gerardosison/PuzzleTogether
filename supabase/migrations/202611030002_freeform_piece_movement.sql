-- Freeform moves retain unfinished pieces on the shared board without awarding
-- completion. Apply after 202611030001_puzzle_together.sql.
-- Existing snapshots remain compatible: (-1,-1) denotes the piece tray.

-- The old release endpoint allowed broad coordinates. Bring any legacy loose
-- position outside the supported board area back to its tray before upgrading.
update public.puzzle_pieces p
set current_x=-1,current_y=-1,version=p.version+1
from public.games g
where p.game_id=g.id and not p.is_placed
  and not (
    (p.current_x=-1 and p.current_y=-1) or
    (p.current_x between 0 and 1::double precision-1::double precision/g.columns and
     p.current_y between 0 and 1::double precision-1::double precision/g.rows)
  );

create function public.move_piece(
  p_game_id uuid,p_index integer,p_x double precision,p_y double precision
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_game public.games; v_changed integer;
begin
  -- Match the established room -> game -> piece lock order.
  perform 1 from public.rooms
    where id=(select room_id from public.games where id=p_game_id) for update;
  select * into v_game from public.games where id=p_game_id for update;
  if not found or not public.is_room_member(v_game.room_id) then
    raise exception 'Join this room before moving pieces.';
  end if;
  if v_game.status<>'playing' or not exists(
    select 1 from public.rooms where id=v_game.room_id
      and current_game_id=p_game_id and status='playing'
  ) then return false; end if;

  -- Coordinates are top-left positions in board units, not device pixels.
  -- Both dimensions must describe the tray, or the whole rectangular piece
  -- must fit on the board. NaN, infinities, nulls and mixed tray values fail.
  if p_x is null or p_y is null or not (
    (p_x=-1 and p_y=-1) or
    (p_x between 0 and 1::double precision-1::double precision/v_game.columns and
     p_y between 0 and 1::double precision-1::double precision/v_game.rows)
  ) then return false; end if;

  update public.puzzle_pieces
    set current_x=p_x,current_y=p_y,locked_by=null,lock_expires_at=null,
      version=version+1
    where game_id=p_game_id and piece_index=p_index and not is_placed
      and locked_by=auth.uid() and lock_expires_at>now();
  get diagnostics v_changed=row_count;
  if v_changed=1 then
    update public.games set version=version+1 where id=p_game_id;
  end if;
  return v_changed=1;
end;
$$;
revoke all on function public.move_piece(uuid,integer,double precision,double precision) from public,anon;
grant execute on function public.move_piece(uuid,integer,double precision,double precision) to authenticated;

-- Keep the prior RPC signature for browsers still running the earlier version.
-- It cannot bypass the new move validation or silently accept a rejected move.
create or replace function public.release_piece(
  p_game_id uuid,p_index integer,p_x double precision,p_y double precision
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.move_piece(p_game_id,p_index,p_x,p_y) then
    raise exception 'This move could not be saved. Reconnect and try again.';
  end if;
end;
$$;
