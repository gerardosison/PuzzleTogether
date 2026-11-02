import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  ImagePlus,
  RotateCcw,
  X,
} from "lucide-react";
import { artworks } from "../data/artworks";
import { DIFFICULTIES } from "../lib/types";
import type { Artwork, Difficulty } from "../lib/types";
import { readPuzzleImage } from "../lib/upload";
import PuzzleBoard from "../components/PuzzleBoard";
import "./solo.css";
interface Session {
  art: Artwork;
  difficulty: Difficulty;
  seed: string;
  started: number;
  completed?: number;
}
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
function getSession(): Session | null {
  try {
    const s = JSON.parse(
      localStorage.getItem("pt-solo-session") || "null",
    ) as Session | null;
    return s &&
      s.art?.image &&
      s.difficulty in DIFFICULTIES &&
      typeof s.started === "number" &&
      typeof s.seed === "string"
      ? s
      : null;
  } catch {
    return null;
  }
}
function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export default function Solo() {
  const [params] = useSearchParams();
  const initial =
    artworks.find((a) => a.id === params.get("art")) || artworks[0];
  const [selected, setSelected] = useState<Artwork>(initial);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [session, setSession] = useState<Session | null>(null);
  const [saved, setSaved] = useState<Session | null>(getSession);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState(false);
  const [resetDialog, setResetDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const modalTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!preview && !resetDialog) return;
    const previous = modalTrigger.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(false);
        setResetDialog(false);
      }
      if (event.key === "Tab") {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, [tabindex="0"]',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [preview, resetDialog]);
  useEffect(() => {
    if (!session) return;
    const tick = () =>
      setElapsed(
        Math.max(
          0,
          Math.floor(
            ((session.completed || Date.now()) - session.started) / 1000,
          ),
        ),
      );
    tick();
    if (session.completed) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session]);
  useEffect(() => {
    document.title = session
      ? `${session.art.title} — PuzzleTogether`
      : "A moment for yourself — PuzzleTogether";
    return () => {
      document.title = "PuzzleTogether — The art of coming together";
    };
  }, [session]);
  const start = () => {
    const next = {
      art: selected,
      difficulty,
      seed: crypto.randomUUID(),
      started: Date.now(),
    };
    setStorageNotice(!save("pt-solo-session", next));
    setSession(next);
    setSaved(next);
    setProgress(0);
    setError("");
    window.scrollTo(0, 0);
  };
  const complete = () => {
    setSession((current) => {
      if (!current || current.completed) return current;
      const next = { ...current, completed: Date.now() };
      save("pt-solo-session", next);
      setSaved(next);
      return next;
    });
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const image = await readPuzzleImage(file);
      setSelected({
        id: `personal-${crypto.randomUUID()}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Your photograph",
        year: "Personal collection",
        image,
        category: "Paintings",
        description: "A little piece of your own world.",
        credit: "Your own image • stored only on this device",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read this image.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  if (!session)
    return (
      <main className="solo-setup page-shell">
        <Link to="/collection" className="back-link">
          <ArrowLeft size={14} /> Back to the collection
        </Link>
        <div className="eyebrow">YOUR OWN QUIET CORNER</div>
        <h1>A moment for yourself.</h1>
        <p className="solo-intro">
          Just you, a beautiful picture, and a little patience.
        </p>
        {saved && !saved.completed && (
          <div className="resume-note">
            <div>
              <span className="eyebrow">LEFT ON YOUR TABLE</span>
              <p>
                {saved.art.title} · {DIFFICULTIES[saved.difficulty].pieces}{" "}
                pieces
              </p>
            </div>
            <button
              className="text-link"
              onClick={() => {
                setSession(saved);
                setSelected(saved.art);
                setDifficulty(saved.difficulty);
              }}
            >
              Continue your puzzle <ArrowRight size={16} />
            </button>
          </div>
        )}
        <div className="solo-setup-grid">
          <div className="solo-art-preview">
            <img src={selected.image} alt={selected.title} />
            <div className="solo-art-label">
              <h2>{selected.title}</h2>
              <p>
                {selected.artist} · {selected.year}
              </p>
              <span>{selected.credit}</span>
            </div>
          </div>
          <div className="solo-settings">
            <div className="eyebrow">01 / CHOOSE YOUR PACE</div>
            <div className="difficulty-options">
              {(
                Object.entries(DIFFICULTIES) as [
                  Difficulty,
                  typeof DIFFICULTIES.easy,
                ][]
              ).map(([key, value]) => (
                <button
                  key={key}
                  className={`difficulty-option ${key === difficulty ? "selected" : ""}`}
                  aria-pressed={key === difficulty}
                  onClick={() => setDifficulty(key)}
                >
                  <span className="difficulty-radio">
                    {key === difficulty && <span />}
                  </span>
                  <div>
                    <strong>{value.label}</strong>
                    <span>
                      {key.charAt(0).toUpperCase() + key.slice(1)} ·{" "}
                      {value.rows} × {value.columns} grid
                    </span>
                  </div>
                  <b>
                    {value.pieces}
                    <small> pieces</small>
                  </b>
                </button>
              ))}
            </div>
            <div className="eyebrow choose-another">02 / MAKE IT YOURS</div>
            <div className="art-selector">
              {artworks.map((a) => (
                <button
                  key={a.id}
                  className={a.id === selected.id ? "selected" : ""}
                  aria-label={`Select ${a.title}`}
                  aria-pressed={a.id === selected.id}
                  onClick={() => setSelected(a)}
                >
                  <img src={a.image} alt="" />
                  {a.id === selected.id && (
                    <span>
                      <Check size={13} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <button
              className="upload-button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <ImagePlus size={16} />
              {uploading
                ? "Preparing your photograph…"
                : "Use your own photograph"}
              <span>JPG, PNG, WebP · up to 5 MB</span>
            </button>
            <p className="upload-privacy">
              Your photograph stays on this device. No cropping.
            </p>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <button className="button button-dark start-puzzle" onClick={start}>
              Find the first piece <ArrowUpRight size={18} />
            </button>
            <p className="solo-saving">
              Progress is saved in this browser. Come back whenever.
            </p>
          </div>
        </div>
      </main>
    );
  if (session.completed)
    return (
      <main className="solo-results page-shell">
        <div className="eyebrow">A LITTLE PATIENCE, A BEAUTIFUL RESULT.</div>
        <h1>Every piece found its place.</h1>
        <p>Take a moment. You made something worth looking at.</p>
        <img
          src={session.art.image}
          alt={session.art.title}
          className="finished-art"
        />
        <div className="results-label">
          <div>
            <h2>{session.art.title}</h2>
            <p>
              {session.art.artist} · {session.art.year}
            </p>
          </div>
          <div>
            <span>{DIFFICULTIES[session.difficulty].pieces} pieces placed</span>
            <span>
              {duration(
                Math.floor((session.completed - session.started) / 1000),
              )}{" "}
              well spent
            </span>
          </div>
        </div>
        <div className="results-actions">
          <button
            className="button button-dark"
            onClick={() => {
              setSession(null);
              setSaved(null);
            }}
          >
            Find another picture <ArrowUpRight size={16} />
          </button>
          <Link className="text-link" to="/create">
            Next time, bring a friend <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    );
  return (
    <main className="solo-game page-shell">
      <div className="game-topline">
        <button
          className="back-link"
          onClick={() => {
            setSession(null);
            setSaved(getSession());
          }}
        >
          <ArrowLeft size={14} /> Leave on the table
        </button>
        <span className="eyebrow">SOLO / YOUR QUIET CORNER</span>
      </div>
      <div className="game-heading">
        <div>
          <h1>{session.art.title}</h1>
          <p>
            {session.art.artist}, {session.art.year}
          </p>
        </div>
        <div className="game-utilities">
          <button
            className="text-link"
            aria-label="Look at the picture"
            onClick={(event) => {
              modalTrigger.current = event.currentTarget;
              setPreview(true);
            }}
          >
            <Eye size={15} />{" "}
            <span className="game-reference-label">Look at the picture</span>
          </button>
          <button
            className="icon-button"
            aria-label="Restart puzzle"
            onClick={(event) => {
              modalTrigger.current = event.currentTarget;
              setResetDialog(true);
            }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <div className="game-progress-row">
        <div>
          <span>
            {progress}{" "}
            <span className="muted">
              of {DIFFICULTIES[session.difficulty].pieces} pieces in place
            </span>
          </span>
          <span className="elapsed-time">
            {duration(elapsed)} <span className="muted"> / no hurry</span>
          </span>
        </div>
        <progress
          value={progress}
          max={DIFFICULTIES[session.difficulty].pieces}
          aria-label="Puzzle progress"
        />
      </div>
      {storageNotice && (
        <p className="notice">
          Your browser storage is full or unavailable. This puzzle works, but
          progress may not survive a refresh.
        </p>
      )}
      <PuzzleBoard
        key={session.seed}
        image={session.art.image}
        difficulty={session.difficulty}
        seed={session.seed}
        storageKey={`pt-solo-${session.seed}`}
        onProgress={(placed) => setProgress(placed)}
        onComplete={complete}
      />
      <p className="game-footnote">
        {session.art.credit} <span>Progress stays on this device.</span>
      </p>
      {preview && (
        <div
          ref={modalRef}
          className="modal-backdrop"
          onClick={() => setPreview(false)}
        >
          <section
            className="picture-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Puzzle reference image"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPreview(false);
            }}
          >
            <button
              autoFocus
              className="icon-button modal-close"
              aria-label="Close picture preview"
              onClick={() => setPreview(false)}
            >
              <X size={18} />
            </button>
            <img src={session.art.image} alt={session.art.title} />
            <p>
              {session.art.title} — {session.art.artist}
            </p>
          </section>
        </div>
      )}
      {resetDialog && (
        <div ref={modalRef} className="modal-backdrop">
          <section
            className="reset-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <div className="eyebrow">A FRESH START</div>
            <h2 id="reset-title">Scatter the pieces again?</h2>
            <p>Your current progress will be replaced with a new puzzle.</p>
            <div>
              <button
                autoFocus
                className="button button-outline"
                onClick={() => setResetDialog(false)}
              >
                Keep my progress
              </button>
              <button
                className="button button-dark"
                onClick={() => {
                  setResetDialog(false);
                  start();
                }}
              >
                Start again
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
