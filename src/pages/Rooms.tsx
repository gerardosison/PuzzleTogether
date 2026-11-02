import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Copy,
  LoaderCircle,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { artworks } from "../data/artworks";
import { DIFFICULTIES } from "../lib/types";
import type { Difficulty } from "../lib/types";
import { ensureGuest, isSupabaseConfigured } from "../lib/supabase";
import {
  claimPiece,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  placePiece,
  releasePiece,
  renewPieceLock,
  setReady,
  startGame,
  startNewRound,
  subscribeRoom,
  updateRoomSettings,
} from "../lib/rooms";
import type { RoomSnapshot } from "../lib/rooms";
import PuzzleBoard from "../components/PuzzleBoard";
import "./rooms.css";

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The room could not be reached. Please try again.";
const nicknameValid = (nickname: string) =>
  nickname.trim().length >= 2 &&
  nickname.trim().length <= 20 &&
  Array.from(nickname).every(
    (character) =>
      character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
  );

function SetupNotice() {
  return (
    <aside className="room-setup-note">
      <strong>The multiplayer gallery is not connected yet.</strong>
      <p>
        Private rooms need a configured Supabase project. In the meantime, you
        can play every artwork on your own.
      </p>
      <Link className="text-link" to="/solo">
        Take a solo seat <ArrowRight size={15} />
      </Link>
    </aside>
  );
}

function RoomEntry({ joining }: { joining: boolean }) {
  const [query] = useSearchParams();
  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem("puzzletogether:nickname") || "";
    } catch {
      return "";
    }
  });
  const [code, setCode] = useState(query.get("code")?.toUpperCase() || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const selected = artworks.find((artwork) => artwork.id === query.get("art"));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nicknameValid(nickname)) {
      setError(
        "Choose a name with 2–20 characters, without control characters.",
      );
      return;
    }
    if (joining && !/^[A-Z2-9]{6}$/.test(code.trim())) {
      setError("Enter the six-character code from your invitation.");
      return;
    }
    if (!isSupabaseConfigured) {
      setError(
        "Multiplayer needs the Supabase configuration. Solo play is available now.",
      );
      return;
    }
    setError("");
    setBusy(true);
    try {
      const roomCode = joining
        ? await joinRoom(code.trim(), nickname.trim())
        : await createRoom(nickname.trim());
      try {
        localStorage.setItem("puzzletogether:nickname", nickname.trim());
      } catch {
        /* A guest session also works without local preferences. */
      }
      if (!joining && selected) {
        const snapshot = await getRoom(roomCode);
        await updateRoomSettings(snapshot.room.id, {
          image_path: selected.image,
          difficulty: snapshot.room.difficulty,
        });
      }
      navigate(`/room/${roomCode}/lobby`);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page-shell room-entry-page">
      <Link to="/" className="room-back">
        <ArrowLeft size={16} /> Back to the gallery
      </Link>
      <div className="room-entry-layout">
        <section className="room-entry-intro">
          <p className="eyebrow">
            {joining ? "YOUR INVITATION AWAITS" : "A TABLE FOR YOUR PEOPLE"}
          </p>
          <h1>
            {joining ? (
              <>
                Good company.
                <br />
                One shared picture.
              </>
            ) : (
              <>
                Make room
                <br />
                for a little art.
              </>
            )}
          </h1>
          <p>
            {joining
              ? "Bring your room code and a name. Your friends will take care of the rest."
              : "Pick a picture, invite a few friends, and find where each piece belongs. No accounts. No rush."}
          </p>
          <div className="room-entry-footnote">
            <span>01—06</span>
            <p>
              Up to six people.
              <br />A private space, just for you.
            </p>
          </div>
        </section>
        <section className="room-entry-form">
          <p className="eyebrow">
            {joining ? "JOIN A PRIVATE ROOM" : "CREATE A PRIVATE ROOM"}
          </p>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
          >
            <label className="form-field">
              Your name
              <input
                autoComplete="nickname"
                name="nickname"
                placeholder="What should we call you?"
                value={nickname}
                maxLength={20}
                minLength={2}
                required
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
            {joining && (
              <label className="form-field">
                Room code
                <input
                  className="room-code-input"
                  name="code"
                  autoComplete="off"
                  placeholder="ABC234"
                  maxLength={6}
                  minLength={6}
                  required
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/[^a-zA-Z0-9]/g, "")
                        .toUpperCase(),
                    )
                  }
                />
                <small>Six characters, shared by your host.</small>
              </label>
            )}
            {selected && !joining && (
              <div className="room-selected-art">
                <img src={selected.image} alt={selected.title} />
                <div>
                  <span className="eyebrow">YOUR FIRST PUZZLE</span>
                  <strong>{selected.title}</strong>
                  <small>{selected.artist}</small>
                </div>
              </div>
            )}
            {error && (
              <p className="room-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button button-dark room-submit"
              disabled={busy || !isSupabaseConfigured}
            >
              {busy ? (
                <>
                  <LoaderCircle size={16} className="room-spinner" />{" "}
                  {joining ? "Finding your room…" : "Setting your table…"}
                </>
              ) : (
                <>
                  {joining ? "Join the room" : "Create a room"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          {!isSupabaseConfigured && <SetupNotice />}
          <p className="room-entry-switch">
            {joining
              ? "Starting something new?"
              : "Already have an invitation?"}{" "}
            <Link to={joining ? "/create" : "/join"}>
              {joining ? "Create a room" : "Join a room"}{" "}
              <ArrowRight size={13} />
            </Link>
          </p>
          <p className="room-privacy">
            Your name belongs to this browser session. No email or password
            needed.
          </p>
        </section>
      </div>
    </main>
  );
}

export function CreateRoom() {
  return <RoomEntry joining={false} />;
}
export function JoinRoom() {
  return <RoomEntry joining />;
}

type Subscription = ReturnType<typeof subscribeRoom>;
function useRoom() {
  const { roomCode = "" } = useParams();
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [userId, setUserId] = useState("");
  const [present, setPresent] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const subscription = useRef<Subscription | null>(null);
  const request = useRef(0);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    const next = await getRoom(roomCode);
    if (alive.current && current === request.current) {
      setSnapshot(next);
      setLoading(false);
    }
    return next;
  }, [roomCode]);
  useEffect(() => {
    alive.current = true;
    let disposed = false;
    setLoading(true);
    setError("");
    if (!isSupabaseConfigured) {
      setLoading(false);
      return () => {
        alive.current = false;
      };
    }
    void (async () => {
      try {
        const identity = await ensureGuest();
        if (disposed) return;
        setUserId(identity);
        const initial = await refresh();
        if (disposed) return;
        const handleChange = () => {
          void refresh().catch((reason: unknown) => {
            if (!disposed) setError(errorText(reason));
          });
        };
        subscription.current = subscribeRoom(
          initial.room.id,
          identity,
          handleChange,
          (ids) => {
            if (!disposed) setPresent(ids);
          },
          (online) => {
            if (!disposed) {
              setConnected(online);
              if (online) handleChange();
            }
          },
          (movement) => {
            if (disposed || movement.userId === identity) return;
            setSnapshot((previous) =>
              previous?.game?.id === movement.gameId
                ? {
                    ...previous,
                    pieces: previous.pieces.map((piece) =>
                      piece.index === movement.index &&
                      !piece.placed &&
                      piece.lockedBy === movement.userId
                        ? { ...piece, x: movement.x, y: movement.y }
                        : piece,
                    ),
                  }
                : previous,
            );
          },
        );
        handleChange();
      } catch (reason) {
        if (!disposed) {
          setError(errorText(reason));
          setLoading(false);
        }
      }
    })();
    return () => {
      disposed = true;
      alive.current = false;
      request.current += 1;
      subscription.current?.dispose();
      subscription.current = null;
    };
  }, [refresh]);
  return {
    roomCode,
    snapshot,
    userId,
    present,
    connected,
    loading,
    error,
    setError,
    refresh,
    subscription,
  };
}

type RoomState = ReturnType<typeof useRoom>;
function RoomStatus({ state }: { state: RoomState }) {
  if (!isSupabaseConfigured)
    return (
      <main className="page-shell room-state-page">
        <SetupNotice />
        <Link to="/" className="text-link">
          Return to the gallery <ArrowRight size={15} />
        </Link>
      </main>
    );
  if (state.loading)
    return (
      <main className="page-shell room-state-page">
        <LoaderCircle className="room-spinner" size={28} />
        <h1>Finding your table.</h1>
        <p>Opening your private puzzle room…</p>
      </main>
    );
  return (
    <main className="page-shell room-state-page">
      <p className="eyebrow">THIS ROOM COULD NOT BE OPENED</p>
      <h1>Let’s find your way back.</h1>
      <p role="alert">
        {state.error ||
          "The room may have expired, or your guest session may have changed."}
      </p>
      <Link to={`/join?code=${state.roomCode}`} className="button button-dark">
        Join with your invitation <ArrowRight size={16} />
      </Link>
    </main>
  );
}

function Connection({ connected }: { connected: boolean }) {
  return (
    <span className={`room-connection ${connected ? "" : "is-offline"}`}>
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connected ? "Connected" : "Reconnecting…"}
    </span>
  );
}

export function Lobby() {
  const state = useRoom();
  const { snapshot, userId, present, connected, error, setError, refresh } =
    state;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    if (snapshot?.room.status === "playing")
      navigate(`/room/${snapshot.room.code}/game`, { replace: true });
    if (snapshot?.room.status === "completed")
      navigate(`/room/${snapshot.room.code}/results`, { replace: true });
  }, [snapshot?.room.status, snapshot?.room.code, navigate]);
  if (!snapshot) return <RoomStatus state={state} />;
  const { room, players } = snapshot;
  const active = players.filter((player) => player.is_member_active);
  const host = room.host_user_id === userId;
  const self = active.find((player) => player.user_id === userId);
  const art = artworks.find((artwork) => artwork.image === room.image_path);
  const canStart =
    active.length >= 2 &&
    active.every(
      (player) => player.user_id === room.host_user_id || player.is_ready,
    ) &&
    !!room.image_path;
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }
  async function copy(kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(
        kind === "code"
          ? room.code
          : `${window.location.origin}/join?code=${room.code}`,
      );
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 2400);
    } catch {
      setError(
        "Copy is unavailable here. Select the room code and share it with your friends.",
      );
    }
  }
  return (
    <main className="page-shell lobby-page">
      <div className="room-topline">
        <p className="eyebrow">YOUR PRIVATE GALLERY</p>
        <Connection connected={connected} />
      </div>
      <div className="room-heading-row">
        <div>
          <h1>A place at the table.</h1>
          <p>
            Choose the art. Invite your people. Begin when everyone is here.
          </p>
        </div>
        <button
          className="text-link"
          onClick={() => {
            void act(async () => {
              await leaveRoom(room.id);
              navigate("/");
            });
          }}
          disabled={busy}
        >
          Leave room <ArrowRight size={15} />
        </button>
      </div>
      {error && (
        <p className="room-error" role="alert">
          {error}
        </p>
      )}
      <div className="lobby-layout">
        <section className="lobby-art-section">
          <div className="lobby-art-frame">
            <img
              src={room.image_path}
              alt={art?.title || "Selected puzzle image"}
            />
          </div>
          <div className="room-art-caption">
            <div>
              <span className="eyebrow">ON YOUR TABLE</span>
              <h2>{art?.title || "Your chosen image"}</h2>
              <p>
                {art
                  ? `${art.artist}, ${art.year}`
                  : "A personal addition to the collection"}
              </p>
            </div>
            <span className="room-piece-label">
              {DIFFICULTIES[room.difficulty].pieces}
              <small>PIECES</small>
            </span>
          </div>
          {host && (
            <details className="room-art-picker">
              <summary>
                Choose a different artwork <ArrowRight size={15} />
              </summary>
              <div className="room-art-options">
                {artworks.map((artwork) => (
                  <button
                    key={artwork.id}
                    disabled={busy}
                    aria-label={`Select ${artwork.title}`}
                    aria-pressed={room.image_path === artwork.image}
                    onClick={() => {
                      void act(() =>
                        updateRoomSettings(room.id, {
                          image_path: artwork.image,
                          difficulty: room.difficulty,
                        }),
                      );
                    }}
                  >
                    <img src={artwork.image} alt="" />
                    <span>{artwork.title}</span>
                    {room.image_path === artwork.image && <Check size={14} />}
                  </button>
                ))}
              </div>
            </details>
          )}
        </section>
        <aside className="lobby-controls">
          <section className="lobby-invite">
            <p className="eyebrow">A SMALL INVITATION</p>
            <div className="room-code-row">
              <strong>{room.code}</strong>
              <button
                aria-label="Copy room code"
                onClick={() => {
                  void copy("code");
                }}
              >
                {copied === "code" ? (
                  <CheckCheck size={20} />
                ) : (
                  <Copy size={18} />
                )}
              </button>
            </div>
            <button
              className="text-link"
              onClick={() => {
                void copy("link");
              }}
            >
              {copied === "link" ? "Invitation copied" : "Copy invitation link"}{" "}
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="lobby-people">
            <div className="room-section-heading">
              <p className="eyebrow">AT THE TABLE</p>
              <span>{active.length} / 6</span>
            </div>
            <ul>
              {active.map((player, index) => (
                <li key={player.id}>
                  <span className="room-player-avatar">
                    {player.nickname.slice(0, 1).toUpperCase()}
                    <i
                      className={
                        present.includes(player.user_id) ? "online" : ""
                      }
                    />
                  </span>
                  <span className="room-player-name">
                    {player.nickname}
                    {player.user_id === userId && <small> (you)</small>}
                    <small>
                      {player.user_id === room.host_user_id
                        ? "Host"
                        : present.includes(player.user_id)
                          ? "At the table"
                          : "Away from the table"}
                    </small>
                  </span>
                  <span className="room-player-state">
                    {player.user_id === room.host_user_id ? (
                      "HOST"
                    ) : player.is_ready ? (
                      <>
                        <Check size={13} /> READY
                      </>
                    ) : (
                      `0${index + 1}`
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {active.length < 2 && (
              <p className="room-muted-note">
                <Users size={16} /> There’s room for your first guest.
              </p>
            )}
          </section>
          <section className="lobby-difficulty">
            <p className="eyebrow">HOW LONG WOULD YOU LIKE TO STAY?</p>
            <div className="room-difficulty-options">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((difficulty) => (
                <button
                  key={difficulty}
                  aria-pressed={room.difficulty === difficulty}
                  disabled={!host || busy}
                  onClick={() => {
                    void act(() =>
                      updateRoomSettings(room.id, {
                        image_path: room.image_path,
                        difficulty,
                      }),
                    );
                  }}
                >
                  <strong>{DIFFICULTIES[difficulty].pieces}</strong>
                  <span>pieces</span>
                  <small>{DIFFICULTIES[difficulty].label}</small>
                </button>
              ))}
            </div>
          </section>
          {host ? (
            <>
              <button
                className="button button-dark room-submit"
                disabled={busy || !canStart || !connected}
                onClick={() => {
                  void act(() => startGame(room.id));
                }}
              >
                Begin the puzzle <ArrowRight size={17} />
              </button>
              <p className="room-start-note">
                {active.length < 2
                  ? "Invite one more person to begin."
                  : !canStart
                    ? "Waiting for your guests to be ready."
                    : "Everyone is here. Your canvas awaits."}
              </p>
            </>
          ) : (
            <>
              <button
                className={`button ${self?.is_ready ? "button-outline" : "button-dark"} room-submit`}
                disabled={busy || !connected}
                onClick={() => {
                  void act(() => setReady(room.id, !self?.is_ready));
                }}
              >
                {self?.is_ready ? (
                  <>
                    <Check size={16} /> Ready when you are
                  </>
                ) : (
                  <>
                    I’m ready <ArrowRight size={17} />
                  </>
                )}
              </button>
              <p className="room-start-note">
                Your host will begin when everyone is ready.
              </p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

function useElapsed(
  started: string | undefined,
  completed: string | null | undefined,
) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (completed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [completed]);
  const seconds = started
    ? Math.max(
        0,
        Math.floor(
          ((completed ? new Date(completed).getTime() : now) -
            new Date(started).getTime()) /
            1000,
        ),
      )
    : 0;
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function MultiplayerGame() {
  const state = useRoom();
  const {
    snapshot,
    userId,
    connected,
    present,
    error,
    setError,
    refresh,
    subscription,
  } = state;
  const navigate = useNavigate();
  const elapsed = useElapsed(
    snapshot?.game?.started_at,
    snapshot?.game?.completed_at,
  );
  useEffect(() => {
    if (snapshot?.room.status === "completed")
      navigate(`/room/${snapshot.room.code}/results`, { replace: true });
    if (snapshot?.room.status === "lobby")
      navigate(`/room/${snapshot.room.code}/lobby`, { replace: true });
  }, [snapshot?.room.status, snapshot?.room.code, navigate]);
  if (!snapshot?.game) return <RoomStatus state={state} />;
  const { room, game, pieces, players } = snapshot;
  const artwork = artworks.find((art) => art.image === game.image_path);
  const placed = pieces.filter((piece) => piece.placed).length;
  async function claim(index: number) {
    if (!connected) {
      setError(
        "Reconnecting to your room. Your progress is safely on the table.",
      );
      return false;
    }
    try {
      const success = await claimPiece(index, game!.id);
      if (!success)
        setError(
          "Someone else has that piece. Try another while they find its place.",
        );
      return success;
    } catch (reason) {
      setError(errorText(reason));
      return false;
    }
  }
  async function place(index: number, x: number, y: number) {
    try {
      const success = await placePiece(index, game!.id, x, y);
      await refresh();
      return success;
    } catch (reason) {
      setError(errorText(reason));
      await refresh().catch(() => undefined);
      return false;
    }
  }
  return (
    <main className="page-shell multiplayer-game-page">
      <div className="room-topline">
        <span className="eyebrow">TABLE {room.code}</span>
        <Connection connected={connected} />
      </div>
      <div className="room-heading-row">
        <div>
          <h1>{artwork?.title || "A picture, coming together."}</h1>
          <p>
            {artwork
              ? `${artwork.artist}, ${artwork.year}`
              : "Your private puzzle collection"}
          </p>
        </div>
        <div className="room-game-numbers">
          <div>
            <strong>
              {placed}
              <span> / {game.total_pieces}</span>
            </strong>
            <small>PIECES IN PLACE</small>
          </div>
          <div>
            <strong>{elapsed}</strong>
            <small>TIME TOGETHER</small>
          </div>
        </div>
      </div>
      <div
        className="room-game-progress"
        role="progressbar"
        aria-label="Puzzle progress"
        aria-valuenow={placed}
        aria-valuemin={0}
        aria-valuemax={game.total_pieces}
      >
        <span style={{ width: `${(placed / game.total_pieces) * 100}%` }} />
      </div>
      <div className="room-game-toolbar">
        <p>
          {players
            .filter((player) => player.is_member_active)
            .map((player) => (
              <span key={player.id} className="room-inline-player">
                <i
                  className={present.includes(player.user_id) ? "online" : ""}
                />
                {player.nickname}
              </span>
            ))}
        </p>
        <details className="room-reference">
          <summary>View the artwork</summary>
          <img
            src={game.image_path}
            alt={artwork?.title || "Puzzle reference"}
          />
        </details>
      </div>
      {error && (
        <div className="room-error room-dismiss-error" role="alert">
          {error}
          <button aria-label="Dismiss message" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <PuzzleBoard
        key={`${game.id}:${game.generation_seed}`}
        image={game.image_path}
        difficulty={game.difficulty}
        seed={game.generation_seed}
        pieces={pieces}
        userId={userId}
        onClaim={claim}
        onPlace={place}
        onMove={(index, x, y) =>
          subscription.current?.sendMove(index, x, y, game.id)
        }
        onRenew={(index) => {
          void renewPieceLock(index, game.id)
            .then((renewed) => {
              if (!renewed)
                setError(
                  "Your hold on this piece expired. Release it and pick it up again.",
                );
            })
            .catch((reason: unknown) => setError(errorText(reason)));
        }}
        onRelease={async (index, x, y) => {
          try {
            const success = await releasePiece(index, game.id, x, y);
            await refresh();
            return success;
          } catch (reason) {
            setError(errorText(reason));
            await refresh().catch(() => undefined);
            return false;
          }
        }}
      />
      <div className="room-game-bottom">
        <p>One picture. Every contribution counts.</p>
        <button
          className="text-link"
          onClick={() => {
            void leaveRoom(room.id)
              .then(() => navigate("/"))
              .catch((reason: unknown) => setError(errorText(reason)));
          }}
        >
          Leave the table <ArrowRight size={15} />
        </button>
      </div>
    </main>
  );
}

export function Results() {
  const state = useRoom();
  const { snapshot, userId, error, setError } = state;
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const elapsed = useElapsed(
    snapshot?.game?.started_at,
    snapshot?.game?.completed_at,
  );
  useEffect(() => {
    if (snapshot?.room.status === "lobby")
      navigate(`/room/${snapshot.room.code}/lobby`, { replace: true });
    if (snapshot?.room.status === "playing")
      navigate(`/room/${snapshot.room.code}/game`, { replace: true });
  }, [snapshot?.room.status, snapshot?.room.code, navigate]);
  if (!snapshot?.game) return <RoomStatus state={state} />;
  const { room, game, pieces, players } = snapshot;
  const artwork = artworks.find((art) => art.image === game.image_path);
  const completed = game.status === "completed";
  if (!completed)
    return (
      <main className="page-shell room-state-page">
        <h1>The picture is still coming together.</h1>
        <Link className="button button-dark" to={`/room/${room.code}/game`}>
          Return to your puzzle <ArrowRight size={16} />
        </Link>
      </main>
    );
  return (
    <main className="page-shell room-results-page">
      <div className="room-results-intro">
        <p className="eyebrow">EVERY PIECE FOUND ITS PLACE</p>
        <h1>
          Look what you
          <br />
          made together.
        </h1>
        <p>A little patience. A few helping hands. One finished picture.</p>
      </div>
      <div className="room-results-layout">
        <figure>
          <div className="room-finished-frame">
            <img
              src={game.image_path}
              alt={`Completed puzzle: ${artwork?.title || "your artwork"}`}
            />
          </div>
          <figcaption>
            <strong>{artwork?.title || "Your shared masterpiece"}</strong>
            <span>
              {artwork
                ? `${artwork.artist}, ${artwork.year}`
                : "From your personal collection"}
            </span>
          </figcaption>
        </figure>
        <aside>
          <div className="room-results-totals">
            <div>
              <strong>{elapsed}</strong>
              <span>TIME TOGETHER</span>
            </div>
            <div>
              <strong>{game.total_pieces}</strong>
              <span>PIECES, ALL IN PLACE</span>
            </div>
          </div>
          <p className="eyebrow">THE HANDS BEHIND THE PICTURE</p>
          <ul className="room-contributions">
            {players.map((player) => {
              const count = pieces.filter(
                (piece) => piece.placed && piece.placedBy === player.user_id,
              ).length;
              return (
                <li key={player.id}>
                  <span>{player.nickname}</span>
                  <strong>
                    {count}{" "}
                    <small>
                      pieces · {Math.round((count / game.total_pieces) * 100)}%
                    </small>
                  </strong>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="room-error" role="alert">
              {error}
            </p>
          )}
          {room.host_user_id === userId ? (
            <button
              className="button button-dark room-submit"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void startNewRound(room.id)
                  .then(() => navigate(`/room/${room.code}/lobby`))
                  .catch((reason: unknown) => setError(errorText(reason)))
                  .finally(() => setBusy(false));
              }}
            >
              Make something else <ArrowRight size={16} />
            </button>
          ) : (
            <p className="room-muted-note">
              Your host can open the table for another puzzle.
            </p>
          )}
          <Link to="/" className="text-link room-results-home">
            Back to the gallery <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
    </main>
  );
}
