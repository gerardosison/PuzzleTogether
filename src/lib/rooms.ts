import { ensureGuest, requireSupabase } from "./supabase";
import type { Difficulty, PieceState } from "./types";

export interface Room {
  id: string;
  code: string;
  host_user_id: string;
  status: "lobby" | "playing" | "completed" | "closed";
  difficulty: Difficulty;
  image_path: string;
  current_game_id: string | null;
  expires_at: string;
}
export interface RoomPlayer {
  id: string;
  room_id: string;
  user_id: string;
  nickname: string;
  is_ready: boolean;
  is_member_active: boolean;
  joined_at: string;
  last_seen_at: string;
}
export interface Game {
  id: string;
  room_id: string;
  image_path: string;
  difficulty: Difficulty;
  rows: number;
  columns: number;
  total_pieces: number;
  completed_pieces: number;
  generation_seed: string;
  status: "playing" | "completed";
  started_at: string;
  completed_at: string | null;
  version: number;
}
export interface RoomSnapshot {
  room: Room;
  players: RoomPlayer[];
  game: Game | null;
  pieces: PieceState[];
}
export interface PieceMove {
  gameId: string;
  index: number;
  x: number;
  y: number;
  userId: string;
}

async function operation<T = undefined>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  await ensureGuest();
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function createRoom(nickname: string) {
  return operation<string>("create_room", { p_nickname: nickname.trim() });
}
export function joinRoom(code: string, nickname: string) {
  return operation<string>("join_room", {
    p_code: code.trim().toUpperCase(),
    p_nickname: nickname.trim(),
  });
}
export function updateRoomSettings(
  roomId: string,
  settings: { image_path: string; difficulty: Difficulty },
) {
  return operation("update_room_settings", {
    p_room_id: roomId,
    p_image_path: settings.image_path,
    p_difficulty: settings.difficulty,
  });
}
export function setReady(roomId: string, ready: boolean) {
  return operation("set_player_ready", { p_room_id: roomId, p_ready: ready });
}
export function startGame(roomId: string) {
  return operation<string>("start_game", { p_room_id: roomId });
}
export function leaveRoom(roomId: string) {
  return operation("leave_room", { p_room_id: roomId });
}
export function startNewRound(roomId: string) {
  return operation("start_new_round", { p_room_id: roomId });
}
export function claimPiece(index: number, gameId: string) {
  return operation<boolean>("claim_piece", {
    p_game_id: gameId,
    p_index: index,
  });
}
export function renewPieceLock(index: number, gameId: string) {
  return operation<boolean>("renew_piece_lock", {
    p_game_id: gameId,
    p_index: index,
  });
}
export function releasePiece(
  index: number,
  gameId: string,
  x: number,
  y: number,
) {
  return operation<boolean>("move_piece", {
    p_game_id: gameId,
    p_index: index,
    p_x: x,
    p_y: y,
  });
}
export function placePiece(
  index: number,
  gameId: string,
  x: number,
  y: number,
) {
  return operation<boolean>("place_piece", {
    p_game_id: gameId,
    p_index: index,
    p_x: x,
    p_y: y,
  });
}

interface CanonicalPiece {
  piece_index: number;
  current_x: number;
  current_y: number;
  is_placed: boolean;
  lock_expires_at: string | null;
  locked_by: string | null;
  placed_by: string | null;
  version: number;
}
export async function getRoom(code: string): Promise<RoomSnapshot> {
  const snapshot = await operation<{
    room: Room;
    players: RoomPlayer[];
    game: Game | null;
    pieces: CanonicalPiece[];
  } | null>("get_room_snapshot", { p_code: code.trim().toUpperCase() });
  if (!snapshot)
    throw new Error(
      "This room could not be opened. Join using its room code first, or ask your host for a new invitation.",
    );
  const pieces: PieceState[] = snapshot.pieces.map((piece) => ({
    index: piece.piece_index,
    x: piece.current_x,
    y: piece.current_y,
    placed: piece.is_placed,
    lockedBy:
      piece.lock_expires_at &&
      new Date(piece.lock_expires_at).getTime() > Date.now()
        ? piece.locked_by
        : null,
    placedBy: piece.placed_by,
    version: piece.version,
  }));
  return {
    room: snapshot.room,
    players: snapshot.players,
    game: snapshot.game,
    pieces,
  };
}

/** Broadcasts are visual hints only. Confirmed placements always come from PostgreSQL. */
export function subscribeRoom(
  roomId: string,
  userId: string,
  onChange: () => void,
  onPresence: (userIds: string[]) => void,
  onConnection: (connected: boolean) => void,
  onMove?: (move: PieceMove) => void,
) {
  const client = requireSupabase();
  let disposed = false;
  let lastMove = 0;
  const channel = client.channel(`room:${roomId}:game`, {
    config: {
      private: true,
      presence: { key: userId },
      broadcast: { self: false },
    },
  });
  for (const table of ["rooms", "room_players", "games", "puzzle_pieces"]) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `${table === "rooms" ? "id" : "room_id"}=eq.${roomId}`,
      },
      () => {
        if (!disposed) onChange();
      },
    );
  }
  channel.on("presence", { event: "sync" }, () => {
    if (!disposed) onPresence(Object.keys(channel.presenceState()));
  });
  channel.on("broadcast", { event: "piece-moved" }, ({ payload }) => {
    if (disposed || !onMove || typeof payload !== "object" || !payload) return;
    const move = payload as PieceMove;
    if (
      typeof move.gameId === "string" &&
      Number.isInteger(move.index) &&
      Number.isFinite(move.x) &&
      Number.isFinite(move.y) &&
      typeof move.userId === "string"
    )
      onMove(move);
  });
  void client.auth.getSession().then(({ data }) => {
    if (!disposed && data.session)
      client.realtime.setAuth(data.session.access_token);
    if (disposed) return;
    channel.subscribe((status) => {
      if (disposed) return;
      const connected = status === "SUBSCRIBED";
      onConnection(connected);
      if (connected) {
        void channel.track({ user_id: userId });
        onChange(); // subscribe first, then fetch: recovers missed durable events after reconnect.
      }
    });
  });
  const heartbeat = setInterval(() => {
    if (!disposed)
      void operation("heartbeat_room", { p_room_id: roomId })
        .then(() => {
          if (!disposed) onChange();
        })
        .catch(() => onConnection(false));
  }, 20_000);
  return {
    dispose() {
      disposed = true;
      clearInterval(heartbeat);
      void client.removeChannel(channel);
    },
    sendMove(index: number, x: number, y: number, gameId: string) {
      if (disposed || performance.now() - lastMove < 80) return;
      lastMove = performance.now();
      void channel.send({
        type: "broadcast",
        event: "piece-moved",
        payload: { gameId, index, x, y, userId },
      });
    },
  };
}

export async function resolveRoomImage(path: string): Promise<string> {
  if (path.startsWith("/art/")) return path;
  const { data, error } = await requireSupabase()
    .storage.from("puzzle-images")
    .createSignedUrl(path, 3600);
  if (error)
    throw new Error("The room image could not be loaded. Please reconnect.");
  return data.signedUrl;
}
