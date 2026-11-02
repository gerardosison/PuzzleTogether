import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import type Konva from "konva";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { DIFFICULTIES } from "../lib/types";
import type { PuzzleBoardProps } from "../lib/types";
import {
  generatePieces,
  isCorrectPlacement,
  shuffledIndices,
  tracePiece,
} from "../lib/puzzle";
import "./puzzle.css";

function restoredPieces(key: string | undefined, total: number): Set<number> {
  if (!key) return new Set();
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`${key}:pieces`) || "[]",
    );
    return new Set(
      Array.isArray(value)
        ? value.filter(
            (n): n is number => Number.isInteger(n) && n >= 0 && n < total,
          )
        : [],
    );
  } catch {
    return new Set();
  }
}

export default function PuzzleBoard({
  image,
  difficulty,
  seed,
  pieces: authoritative,
  onClaim,
  onPlace,
  onRelease,
  onMove,
  onRenew,
  onProgress,
  onComplete,
  storageKey,
  userId,
}: PuzzleBoardProps) {
  const geometry = useMemo(
    () => generatePieces(difficulty, seed),
    [difficulty, seed],
  );
  const order = useMemo(
    () => shuffledIndices(geometry.length, seed),
    [geometry.length, seed],
  );
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const stateKey = JSON.stringify([image, difficulty, seed, storageKey]);
  const [localProgress, setLocalProgress] = useState(() => ({
    key: stateKey,
    placed: restoredPieces(storageKey, geometry.length),
  }));
  const localPlaced = useMemo(
    () =>
      localProgress.key === stateKey
        ? localProgress.placed
        : restoredPieces(storageKey, geometry.length),
    [localProgress, stateKey, storageKey, geometry.length],
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [targetRow, setTargetRow] = useState(0);
  const [targetColumn, setTargetColumn] = useState(0);
  const [status, setStatus] = useState(
    "Drag a piece onto the canvas. Start with an edge, or follow your eye.",
  );
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [reference, setReference] = useState(false);
  const [width, setWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMove = useRef(0);
  const pointerAnchor = useRef<{ index: number; x: number; y: number } | null>(
    null,
  );
  const dragExpansion = useRef<{ index: number; x: number; y: number } | null>(
    null,
  );
  const claimRef = useRef<Promise<boolean> | null>(null);
  const claimGranted = useRef(false);
  const completeNotified = useRef<string | null>(null);
  const callbacks = useRef({ onProgress, onComplete, onRenew });
  useEffect(() => {
    callbacks.current = { onProgress, onComplete, onRenew };
  }, [onProgress, onComplete, onRenew]);
  const placed = useMemo(
    () =>
      new Set([
        ...localPlaced,
        ...(authoritative?.filter((p) => p.placed).map((p) => p.index) || []),
      ]),
    [localPlaced, authoritative],
  );
  const remaining = order.filter((index) => !placed.has(index));
  const pageCount = Math.max(1, Math.ceil(remaining.length / 12));
  const safePage = Math.min(page, pageCount - 1);
  const visible = remaining.slice(safePage * 12, safePage * 12 + 12);
  const { rows, columns } = DIFFICULTIES[difficulty];

  useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [stateKey]);
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    setLoadedImage(null);
    setImageError(false);
    img.onload = () => {
      if (active) setLoadedImage(img);
    };
    img.onerror = () => {
      if (active) setImageError(true);
    };
    img.src = image;
    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [image]);
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(240, entries[0].contentRect.width)),
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    callbacks.current.onProgress?.(placed.size, geometry.length);
    if (
      placed.size === geometry.length &&
      completeNotified.current !== stateKey
    ) {
      completeNotified.current = stateKey;
      callbacks.current.onComplete?.();
    }
    if (storageKey && !authoritative) {
      try {
        localStorage.setItem(
          `${storageKey}:pieces`,
          JSON.stringify([...placed]),
        );
      } catch {
        setStatus(
          "Your browser could not save this puzzle. You can keep playing in this tab.",
        );
      }
    }
  }, [placed, geometry.length, storageKey, authoritative, stateKey]);
  useEffect(() => {
    if (dragging === null || !callbacks.current.onRenew) return;
    const interval = window.setInterval(
      () => callbacks.current.onRenew?.(dragging),
      4000,
    );
    return () => window.clearInterval(interval);
  }, [dragging]);

  const ratio = loadedImage
    ? loadedImage.naturalWidth / loadedImage.naturalHeight
    : 4 / 3;
  const boardWidth = Math.min(720, 540 * ratio);
  const boardHeight = Math.min(540, 720 / ratio);
  const boardLeft = (800 - boardWidth) / 2;
  const boardTop = 24;
  const trayTop = boardHeight + 82;
  const stageHeight = trayTop + 204;
  const pieceWidth = boardWidth / columns;
  const pieceHeight = boardHeight / rows;
  const thumbnailScale = Math.min(88 / pieceWidth, 68 / pieceHeight, 1);
  const scale = width / 800;
  const trayPosition = (index: number) => {
    const slot = Math.max(0, visible.indexOf(index));
    return {
      x: 52 + (slot % 6) * 120 + (88 - pieceWidth * thumbnailScale) / 2,
      y:
        trayTop +
        20 +
        Math.floor(slot / 6) * 94 +
        (68 - pieceHeight * thumbnailScale) / 2,
    };
  };

  const place = useCallback(
    async (index: number, x: number, y: number): Promise<boolean> => {
      if (!isCorrectPlacement(geometry[index], x, y)) {
        setStatus("Not quite there. Try another position.");
        return false;
      }
      try {
        if (onPlace && !(await onPlace(index, x, y))) {
          setStatus("That placement could not be confirmed. Please try again.");
          return false;
        }
        setLocalProgress((previous) => ({
          key: stateKey,
          placed: new Set([
            ...(previous.key === stateKey
              ? previous.placed
              : restoredPieces(storageKey, geometry.length)),
            index,
          ]),
        }));
        setSelected(null);
        setStatus(`Piece ${index + 1} found its place.`);
        return true;
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "The placement could not be saved. Please try again.",
        );
        return false;
      }
    },
    [geometry, onPlace, stateKey, storageKey],
  );

  const keyboardPlace = async () => {
    if (selected === null || busy || placed.has(selected)) return;
    setBusy(true);
    try {
      if (onClaim && !(await onClaim(selected))) {
        setStatus("Someone else is moving this piece. Choose another.");
        return;
      }
      const x = targetColumn / columns;
      const y = targetRow / rows;
      const success = await place(selected, x, y);
      if (!success) onRelease?.(selected, -1, -1);
    } catch {
      setStatus("The connection interrupted your move. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (imageError)
    return (
      <div className="puzzle-error" role="alert">
        This artwork could not be loaded. Return to the collection and try
        another image.
      </div>
    );

  return (
    <div className="puzzle-workspace" ref={containerRef}>
      <div className="puzzle-toolbar">
        <span>
          {placed.size} of {geometry.length} pieces in place
        </span>
        <button
          type="button"
          aria-pressed={reference}
          onClick={() => setReference(!reference)}
        >
          {reference ? <EyeOff size={15} /> : <Eye size={15} />}
          {reference ? "Hide reference" : "Show reference"}
        </button>
      </div>
      {reference && (
        <div className="puzzle-reference">
          <img src={image} alt="Reference for the complete puzzle" />
          <span>Take a closer look.</span>
        </div>
      )}
      {!loadedImage ? (
        <div className="puzzle-loading" role="status">
          Preparing your canvas…
        </div>
      ) : (
        <Stage
          width={800 * scale}
          height={stageHeight * scale}
          scaleX={scale}
          scaleY={scale}
          aria-hidden="true"
        >
          <Layer>
            <Rect
              x={boardLeft}
              y={boardTop}
              width={boardWidth}
              height={boardHeight}
              fill="#efeeeb"
              stroke="#b9b8b2"
              strokeWidth={1}
            />
            {Array.from({ length: columns - 1 }, (_, i) => (
              <Line
                key={`v${i}`}
                points={[
                  boardLeft + (i + 1) * pieceWidth,
                  boardTop,
                  boardLeft + (i + 1) * pieceWidth,
                  boardTop + boardHeight,
                ]}
                stroke="#d8d7d0"
                strokeWidth={0.7}
                dash={[3, 5]}
              />
            ))}
            {Array.from({ length: rows - 1 }, (_, i) => (
              <Line
                key={`h${i}`}
                points={[
                  boardLeft,
                  boardTop + (i + 1) * pieceHeight,
                  boardLeft + boardWidth,
                  boardTop + (i + 1) * pieceHeight,
                ]}
                stroke="#d8d7d0"
                strokeWidth={0.7}
                dash={[3, 5]}
              />
            ))}
            {placed.size === 0 && (
              <Text
                x={boardLeft}
                y={boardTop + boardHeight / 2 - 7}
                width={boardWidth}
                text="A little patience. One piece at a time."
                align="center"
                fontSize={13}
                fill="#7d7b75"
                fontFamily="Arial"
                listening={false}
              />
            )}
            <Text
              x={40}
              y={trayTop - 18}
              text="THE PIECE TABLE"
              fontFamily="Arial"
              letterSpacing={2}
              fontSize={10}
              fill="#686760"
              listening={false}
            />
            <Line
              points={[40, trayTop - 2, 760, trayTop - 2]}
              stroke="#d1d0c9"
              strokeWidth={1}
            />
            {geometry
              .filter(
                (piece) =>
                  placed.has(piece.index) ||
                  visible.includes(piece.index) ||
                  authoritative?.some(
                    (p) =>
                      p.index === piece.index &&
                      p.lockedBy &&
                      p.lockedBy !== userId,
                  ),
              )
              .sort(
                (a, b) =>
                  Number(placed.has(b.index)) - Number(placed.has(a.index)),
              )
              .map((piece) => {
                const isPlaced = placed.has(piece.index);
                const remote = authoritative?.find(
                  (p) => p.index === piece.index,
                );
                const lockedElsewhere =
                  !!remote?.lockedBy && remote.lockedBy !== userId;
                const remoteOnBoard =
                  lockedElsewhere && remote.x >= 0 && remote.y >= 0;
                const position = isPlaced
                  ? {
                      x: boardLeft + piece.x * boardWidth,
                      y: boardTop + piece.y * boardHeight,
                    }
                  : remoteOnBoard
                    ? {
                        x: boardLeft + remote.x * boardWidth,
                        y: boardTop + remote.y * boardHeight,
                      }
                    : trayPosition(piece.index);
                const pieceScale =
                  isPlaced || remoteOnBoard ? 1 : thumbnailScale;
                return (
                  <Shape
                    key={piece.index}
                    x={position.x}
                    y={position.y}
                    scaleX={pieceScale}
                    scaleY={pieceScale}
                    draggable={!isPlaced && !lockedElsewhere && !busy}
                    stroke={selected === piece.index ? "#171716" : "#f7f6f2"}
                    strokeWidth={isPlaced ? 0.45 : 1.4}
                    opacity={lockedElsewhere ? 0.65 : 1}
                    shadowColor="#000"
                    shadowBlur={isPlaced ? 0 : 3}
                    shadowOpacity={0.13}
                    shadowOffsetY={isPlaced ? 0 : 2}
                    sceneFunc={(context, shape) => {
                      context.save();
                      tracePiece(context, piece, pieceWidth, pieceHeight);
                      context.clip();
                      context.drawImage(
                        loadedImage,
                        -piece.x * boardWidth,
                        -piece.y * boardHeight,
                        boardWidth,
                        boardHeight,
                      );
                      context.restore();
                      tracePiece(context, piece, pieceWidth, pieceHeight);
                      context.strokeShape(shape);
                    }}
                    hitFunc={(context, shape) => {
                      tracePiece(context, piece, pieceWidth, pieceHeight);
                      context.fillStrokeShape(shape);
                    }}
                    onClick={() => {
                      if (!isPlaced && !lockedElsewhere)
                        setSelected(piece.index);
                    }}
                    onTap={() => {
                      if (!isPlaced && !lockedElsewhere)
                        setSelected(piece.index);
                    }}
                    onMouseDown={(event) => {
                      const point = event.target.getRelativePointerPosition();
                      if (point)
                        pointerAnchor.current = {
                          index: piece.index,
                          ...point,
                        };
                    }}
                    onTouchStart={(event) => {
                      const point = event.target.getRelativePointerPosition();
                      if (point)
                        pointerAnchor.current = {
                          index: piece.index,
                          ...point,
                        };
                    }}
                    dragBoundFunc={(position) => {
                      const expansion = dragExpansion.current;
                      if (expansion?.index !== piece.index) return position;
                      // Konva retains the thumbnail's pointer offset for this drag.
                      // Shift its proposed absolute position by the expansion so
                      // the exact point grabbed stays underneath the pointer.
                      return {
                        x: position.x - expansion.x * scale,
                        y: position.y - expansion.y * scale,
                      };
                    }}
                    onDragStart={(event) => {
                      const node = event.target as Konva.Shape;
                      const anchor =
                        pointerAnchor.current?.index === piece.index
                          ? pointerAnchor.current
                          : node.getRelativePointerPosition();
                      dragExpansion.current = {
                        index: piece.index,
                        x: (anchor?.x || 0) * (1 - pieceScale),
                        y: (anchor?.y || 0) * (1 - pieceScale),
                      };
                      node.moveToTop();
                      node.scale({ x: 1, y: 1 });
                      setSelected(piece.index);
                      setDragging(piece.index);
                      claimGranted.current = !onClaim;
                      claimRef.current = onClaim
                        ? onClaim(piece.index)
                            .then((granted) => {
                              claimGranted.current = granted;
                              if (!granted) {
                                node.stopDrag();
                                dragExpansion.current = null;
                                node.position(position);
                                node.scale({ x: pieceScale, y: pieceScale });
                                setDragging(null);
                                setStatus(
                                  "Someone else has this piece. Try another.",
                                );
                              }
                              return granted;
                            })
                            .catch(() => {
                              node.stopDrag();
                              dragExpansion.current = null;
                              node.position(position);
                              node.scale({ x: pieceScale, y: pieceScale });
                              setDragging(null);
                              setStatus(
                                "Could not reserve this piece. Please try again.",
                              );
                              return false;
                            })
                        : Promise.resolve(true);
                    }}
                    onDragMove={(event) => {
                      if (
                        !claimGranted.current ||
                        Date.now() - lastMove.current < 80
                      )
                        return;
                      lastMove.current = Date.now();
                      onMove?.(
                        piece.index,
                        (event.target.x() - boardLeft) / boardWidth,
                        (event.target.y() - boardTop) / boardHeight,
                      );
                    }}
                    onDragEnd={async (event) => {
                      const node = event.target as Konva.Shape;
                      const x = (node.x() - boardLeft) / boardWidth;
                      const y = (node.y() - boardTop) / boardHeight;
                      dragExpansion.current = null;
                      pointerAnchor.current = null;
                      setDragging(null);
                      setBusy(true);
                      try {
                        const granted = await (claimRef.current ||
                          Promise.resolve(true));
                        if (granted && (await place(piece.index, x, y))) {
                          node.position({
                            x: boardLeft + piece.x * boardWidth,
                            y: boardTop + piece.y * boardHeight,
                          });
                          node.scale({ x: 1, y: 1 });
                        } else {
                          node.position(trayPosition(piece.index));
                          node.scale({ x: thumbnailScale, y: thumbnailScale });
                          if (granted) onRelease?.(piece.index, -1, -1);
                        }
                      } finally {
                        setBusy(false);
                        claimRef.current = null;
                        claimGranted.current = false;
                      }
                    }}
                  />
                );
              })}
          </Layer>
        </Stage>
      )}
      <div className="puzzle-table-footer">
        <p role="status" aria-live="polite">
          {status}
        </p>
        {pageCount > 1 && (
          <div className="puzzle-pagination">
            <button
              type="button"
              aria-label="Previous pieces"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              aria-label="Next pieces"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>
      {placed.size < geometry.length && (
        <details className="puzzle-keyboard">
          <summary>Prefer to use your keyboard?</summary>
          <p>
            Choose a piece, then a row and column on the canvas. Rows run top to
            bottom; columns run left to right.
          </p>
          <div
            className="puzzle-piece-select"
            aria-label="Choose an unplaced piece"
          >
            {visible.map((index) => (
              <button
                type="button"
                key={index}
                aria-label={`Select piece ${index + 1}`}
                aria-pressed={selected === index}
                disabled={
                  !!authoritative?.find(
                    (p) =>
                      p.index === index && p.lockedBy && p.lockedBy !== userId,
                  )
                }
                onClick={() => setSelected(index)}
                style={{
                  backgroundImage: `url("${image}")`,
                  backgroundSize: `${columns * 100}% ${rows * 100}%`,
                  backgroundPosition: `${(geometry[index].column / Math.max(1, columns - 1)) * 100}% ${(geometry[index].row / Math.max(1, rows - 1)) * 100}%`,
                }}
              >
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
          <div className="puzzle-keyboard-controls">
            <label>
              Row
              <select
                aria-label="Target row"
                value={targetRow}
                onChange={(e) => setTargetRow(Number(e.target.value))}
              >
                {Array.from({ length: rows }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Column
              <select
                aria-label="Target column"
                value={targetColumn}
                onChange={(e) => setTargetColumn(Number(e.target.value))}
              >
                {Array.from({ length: columns }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button button-dark"
              disabled={selected === null || busy}
              onClick={() => void keyboardPlace()}
            >
              {busy
                ? "Placing…"
                : selected === null
                  ? "Choose a piece"
                  : `Place piece ${selected + 1}`}
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
