import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import type Konva from "konva";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Undo2 } from "lucide-react";
import { DIFFICULTIES } from "../lib/types";
import type { PuzzleBoardProps } from "../lib/types";
import {
  generatePieces,
  isCorrectPlacement,
  shuffledIndices,
  tracePiece,
} from "../lib/puzzle";
import {
  boundedPosition,
  isOnBoard,
  loadPositions,
  tableLayout,
} from "../lib/table";
import type { Point } from "../lib/table";
import "./puzzle.css";

function restoredPieces(key: string | undefined, total: number): Set<number> {
  if (!key) return new Set();
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(`${key}:pieces`) || "[]",
    );
    return new Set(
      Array.isArray(raw)
        ? raw.filter(
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
  const { rows, columns } = DIFFICULTIES[difficulty];
  const identity = JSON.stringify([image, difficulty, seed, storageKey]);
  const [local, setLocal] = useState(() => ({
    identity,
    placed: restoredPieces(storageKey, geometry.length),
    positions: loadPositions(storageKey, geometry.length, columns, rows),
  }));
  const localState = useMemo(
    () =>
      local.identity === identity
        ? local
        : {
            identity,
            placed: restoredPieces(storageKey, geometry.length),
            positions: loadPositions(
              storageKey,
              geometry.length,
              columns,
              rows,
            ),
          },
    [local, identity, storageKey, geometry.length, columns, rows],
  );
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [targetRow, setTargetRow] = useState(0);
  const [targetColumn, setTargetColumn] = useState(0);
  const [status, setStatus] = useState(
    "Arrange pieces anywhere on the board. Matching pieces snap into place.",
  );
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [reference, setReference] = useState(false);
  const [size, setSize] = useState({ width: 800, height: 460 });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const shapeRefs = useRef(new Map<number, Konva.Shape>());
  const activeDrag = useRef<number | null>(null);
  const anchor = useRef<{ index: number; x: number; y: number } | null>(null);
  const expansion = useRef<Point | null>(null);
  const claimRef = useRef<Promise<boolean> | null>(null);
  const claimGranted = useRef(false);
  const lastMove = useRef(0);
  const completeNotified = useRef<string | null>(null);
  const callbacks = useRef({ onProgress, onComplete, onRenew });
  useEffect(() => {
    callbacks.current = { onProgress, onComplete, onRenew };
  }, [onProgress, onComplete, onRenew]);
  const placed = useMemo(
    () =>
      authoritative
        ? new Set(authoritative.filter((p) => p.placed).map((p) => p.index))
        : localState.placed,
    [authoritative, localState.placed],
  );
  const positions = useMemo(
    () =>
      authoritative
        ? Object.fromEntries(
            authoritative
              .filter((p) => !p.placed && isOnBoard(p, columns, rows))
              .map((p) => [p.index, { x: p.x, y: p.y }]),
          )
        : localState.positions,
    [authoritative, localState.positions, columns, rows],
  );
  const ratio = loadedImage
    ? loadedImage.naturalWidth / loadedImage.naturalHeight
    : 4 / 3;
  const layout = useMemo(
    () => tableLayout(size.width, size.height, ratio),
    [size, ratio],
  );
  const { board, tray, pageSize } = layout;
  const pieceWidth = board.width / columns;
  const pieceHeight = board.height / rows;
  const remaining = order.filter(
    (index) => !placed.has(index) && !positions[index],
  );
  const pageCount = Math.max(1, Math.ceil(remaining.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = remaining.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );
  const slotWidth = tray.width / layout.columns;
  const slotHeight = (tray.height - 27) / layout.rows;
  const thumbnailScale = Math.min(
    (slotWidth - 18) / (pieceWidth * 1.45),
    (slotHeight - 14) / (pieceHeight * 1.45),
    1,
  );
  const trayPosition = (index: number) => {
    const slot = Math.max(0, visible.indexOf(index));
    return {
      x:
        tray.x +
        (slot % layout.columns) * slotWidth +
        (slotWidth - pieceWidth * thumbnailScale) / 2,
      y:
        tray.y +
        27 +
        Math.floor(slot / layout.columns) * slotHeight +
        (slotHeight - pieceHeight * thumbnailScale) / 2,
    };
  };
  const canonicalPosition = (index: number) =>
    placed.has(index)
      ? { x: geometry[index].x, y: geometry[index].y }
      : positions[index];
  const screenPosition = (index: number) => {
    const position = canonicalPosition(index);
    return position
      ? {
          x: board.x + position.x * board.width,
          y: board.y + position.y * board.height,
        }
      : trayPosition(index);
  };

  useEffect(() => {
    setPage(0);
    setSelected(null);
  }, [identity]);
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
  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const measure = () => {
      const width = container.getBoundingClientRect().width;
      if (!width) return;
      const viewport = window.visualViewport?.height || window.innerHeight;
      // Measure the document position, not the scrolled position; scrolling must not grow the canvas.
      const top = canvas.getBoundingClientRect().top + window.scrollY;
      const height = Math.min(720, Math.max(150, viewport - top - 62));
      setSize((previous) =>
        Math.abs(previous.width - width) < 0.5 &&
        Math.abs(previous.height - height) < 0.5
          ? previous
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => {
    callbacks.current.onProgress?.(placed.size, geometry.length);
    if (
      placed.size === geometry.length &&
      completeNotified.current !== identity
    ) {
      completeNotified.current = identity;
      callbacks.current.onComplete?.();
    }
  }, [placed, geometry.length, identity]);
  useEffect(() => {
    if (!storageKey || authoritative) return;
    try {
      localStorage.setItem(
        `${storageKey}:pieces`,
        JSON.stringify([...localState.placed]),
      );
      localStorage.setItem(
        `${storageKey}:positions`,
        JSON.stringify(localState.positions),
      );
    } catch {
      setStatus(
        "Your browser could not save this puzzle. You can keep playing in this tab.",
      );
    }
  }, [storageKey, authoritative, localState]);
  useEffect(() => {
    if (dragging === null || !callbacks.current.onRenew) return;
    const timer = window.setInterval(
      () => callbacks.current.onRenew?.(dragging),
      4000,
    );
    return () => clearInterval(timer);
  }, [dragging]);

  const updateLocal = useCallback(
    (index: number, position: Point | null, solved: boolean) => {
      setLocal((previous) => {
        const base =
          previous.identity === identity
            ? previous
            : {
                identity,
                placed: restoredPieces(storageKey, geometry.length),
                positions: loadPositions(
                  storageKey,
                  geometry.length,
                  columns,
                  rows,
                ),
              };
        const nextPositions = { ...base.positions };
        if (position && !solved) nextPositions[index] = position;
        else delete nextPositions[index];
        return {
          identity,
          placed: solved ? new Set([...base.placed, index]) : base.placed,
          positions: nextPositions,
        };
      });
    },
    [identity, storageKey, geometry.length, columns, rows],
  );
  const move = async (
    index: number,
    x: number,
    y: number,
    toTray = false,
  ): Promise<boolean> => {
    if (!toTray && isCorrectPlacement(geometry[index], x, y)) {
      if (onPlace && !(await onPlace(index, x, y))) {
        setStatus("That placement could not be confirmed. Please try again.");
        return false;
      }
      if (!authoritative) updateLocal(index, null, true);
      setSelected(null);
      setStatus(`Piece ${index + 1} found its place.`);
      return true;
    }
    const position = toTray
      ? { x: -1, y: -1 }
      : boundedPosition(x, y, columns, rows);
    if (onRelease && !(await onRelease(index, position.x, position.y))) {
      setStatus(
        "That move could not be saved. The piece has returned to its last position.",
      );
      return false;
    }
    if (authoritative && !onRelease) {
      setStatus("Loose moves need the latest room setup. Please reconnect.");
      return false;
    }
    if (!authoritative) updateLocal(index, toTray ? null : position, false);
    setStatus(
      toTray
        ? `Piece ${index + 1} is back in the tray.`
        : `Piece ${index + 1} is on the table. Move it whenever you like.`,
    );
    return true;
  };
  const keyboardMove = async (toTray = false) => {
    if (selected === null || busy || placed.has(selected)) return;
    setBusy(true);
    try {
      if (onClaim && !(await onClaim(selected))) {
        setStatus("Someone else is moving this piece. Choose another.");
        return;
      }
      const success = await move(
        selected,
        targetColumn / columns,
        targetRow / rows,
        toTray,
      );
      if (!success && onRelease) {
        const position = positions[selected] || { x: -1, y: -1 };
        await onRelease(selected, position.x, position.y);
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The connection interrupted your move. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const lockedElsewhere = (index: number) => {
    const lock = authoritative?.find((p) => p.index === index)?.lockedBy;
    return !!lock && lock !== userId;
  };
  const movableIndices = [
    ...new Set([
      ...visible,
      ...order.filter((index) => !!positions[index] && !placed.has(index)),
    ]),
  ];
  const slots = visible.map((index) => ({
    index,
    ...trayPosition(index),
    width: pieceWidth * thumbnailScale,
    height: pieceHeight * thumbnailScale,
  }));
  const tablePieces = geometry
    .filter((p) => placed.has(p.index) || !!positions[p.index])
    .map((p) => ({
      index: p.index,
      ...screenPosition(p.index),
      width: pieceWidth,
      height: pieceHeight,
      placed: placed.has(p.index),
    }));
  const metadata = {
    board,
    tray,
    slots,
    tablePieces,
    width: size.width,
    height: size.height,
    pageSize,
  };

  if (imageError)
    return (
      <div className="puzzle-error" role="alert">
        This artwork could not be loaded. Return to the collection and try
        another image.
      </div>
    );
  return (
    <div className="puzzle-workspace" ref={containerRef} aria-busy={busy}>
      <div className="puzzle-toolbar">
        <span>
          {placed.size} of {geometry.length} pieces in place
        </span>
        <button
          type="button"
          aria-pressed={reference}
          onClick={() => setReference(!reference)}
        >
          {reference ? <EyeOff size={15} /> : <Eye size={15} />}{" "}
          {reference ? "Hide reference" : "Show reference"}
        </button>
      </div>
      <div
        className="puzzle-canvas"
        ref={canvasRef}
        data-layout={JSON.stringify(metadata)}
        aria-label="Puzzle board and piece tray"
      >
        {!loadedImage ? (
          <div className="puzzle-loading" role="status">
            Preparing your canvas…
          </div>
        ) : (
          <Stage width={size.width} height={size.height} aria-hidden="true">
            <Layer>
              <Rect
                {...board}
                fill="#efeeeb"
                stroke="#b9b8b2"
                strokeWidth={1}
              />
              {Array.from({ length: columns - 1 }, (_, i) => (
                <Line
                  key={`v${i}`}
                  points={[
                    board.x + (i + 1) * pieceWidth,
                    board.y,
                    board.x + (i + 1) * pieceWidth,
                    board.y + board.height,
                  ]}
                  stroke="#d8d7d0"
                  strokeWidth={0.7}
                  dash={[3, 5]}
                  listening={false}
                />
              ))}
              {Array.from({ length: rows - 1 }, (_, i) => (
                <Line
                  key={`h${i}`}
                  points={[
                    board.x,
                    board.y + (i + 1) * pieceHeight,
                    board.x + board.width,
                    board.y + (i + 1) * pieceHeight,
                  ]}
                  stroke="#d8d7d0"
                  strokeWidth={0.7}
                  dash={[3, 5]}
                  listening={false}
                />
              ))}
              {!placed.size && !Object.keys(positions).length && (
                <Text
                  x={board.x + 8}
                  y={board.y + board.height / 2 - 8}
                  width={board.width - 16}
                  text="Your picture starts here."
                  align="center"
                  fontSize={Math.min(13, board.width / 24)}
                  fill="#7d7b75"
                  fontFamily="Arial"
                  listening={false}
                />
              )}
              <Rect
                {...tray}
                fill="#f1f0eb"
                stroke="#dedbd3"
                strokeWidth={0.7}
                listening={false}
              />
              <Text
                x={tray.x + 8}
                y={tray.y + 9}
                width={tray.width - 16}
                text={
                  remaining.length
                    ? "THE PIECE TRAY"
                    : "ALL PIECES ON THE TABLE"
                }
                letterSpacing={1.2}
                fontSize={Math.min(10, tray.width / 20)}
                fill="#686760"
                fontFamily="Arial"
                listening={false}
              />
              {geometry
                .filter(
                  (p) =>
                    placed.has(p.index) ||
                    positions[p.index] ||
                    visible.includes(p.index) ||
                    activeDrag.current === p.index,
                )
                .sort(
                  (a, b) =>
                    Number(placed.has(b.index)) - Number(placed.has(a.index)) ||
                    Number(a.index === selected) - Number(b.index === selected),
                )
                .map((piece) => {
                  const isPlaced = placed.has(piece.index);
                  const onBoard = !!canonicalPosition(piece.index);
                  const originalPosition = screenPosition(piece.index);
                  const originalScale = onBoard ? 1 : thumbnailScale;
                  const currentNode = shapeRefs.current.get(piece.index);
                  const isDragging = activeDrag.current === piece.index;
                  const position =
                    isDragging && currentNode
                      ? { x: currentNode.x(), y: currentNode.y() }
                      : originalPosition;
                  const pieceScale = isDragging ? 1 : originalScale;
                  const captureAnchor = (node: Konva.Node) => {
                    const point = node.getRelativePointerPosition();
                    if (point)
                      anchor.current = { index: piece.index, ...point };
                  };
                  return (
                    <Shape
                      key={piece.index}
                      ref={(node) => {
                        if (node) shapeRefs.current.set(piece.index, node);
                        else shapeRefs.current.delete(piece.index);
                      }}
                      {...position}
                      scaleX={pieceScale}
                      scaleY={pieceScale}
                      draggable={
                        !isPlaced && !lockedElsewhere(piece.index) && !busy
                      }
                      stroke={selected === piece.index ? "#171716" : "#f7f6f2"}
                      strokeWidth={isPlaced ? 0.45 : 1.2}
                      opacity={lockedElsewhere(piece.index) ? 0.6 : 1}
                      shadowColor="#000"
                      shadowBlur={isPlaced ? 0 : 3}
                      shadowOpacity={0.15}
                      shadowOffsetY={isPlaced ? 0 : 2}
                      sceneFunc={(context, shape) => {
                        context.save();
                        tracePiece(context, piece, pieceWidth, pieceHeight);
                        context.clip();
                        context.drawImage(
                          loadedImage,
                          -piece.x * board.width,
                          -piece.y * board.height,
                          board.width,
                          board.height,
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
                        if (!isPlaced && !lockedElsewhere(piece.index))
                          setSelected(piece.index);
                      }}
                      onTap={() => {
                        if (!isPlaced && !lockedElsewhere(piece.index))
                          setSelected(piece.index);
                      }}
                      onMouseDown={(event) => captureAnchor(event.target)}
                      onTouchStart={(event) => captureAnchor(event.target)}
                      dragBoundFunc={(position) =>
                        expansion.current && activeDrag.current === piece.index
                          ? {
                              x: position.x - expansion.current.x,
                              y: position.y - expansion.current.y,
                            }
                          : position
                      }
                      onDragStart={(event) => {
                        const node = event.target as Konva.Shape;
                        const point =
                          anchor.current?.index === piece.index
                            ? anchor.current
                            : node.getRelativePointerPosition();
                        expansion.current = {
                          x: (point?.x || 0) * (1 - originalScale),
                          y: (point?.y || 0) * (1 - originalScale),
                        };
                        activeDrag.current = piece.index;
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
                                  setStatus(
                                    "Someone else has this piece. Try another.",
                                  );
                                  node.stopDrag();
                                }
                                return granted;
                              })
                              .catch(() => {
                                setStatus(
                                  "Could not reserve this piece. Please try again.",
                                );
                                node.stopDrag();
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
                          (event.target.x() - board.x) / board.width,
                          (event.target.y() - board.y) / board.height,
                        );
                      }}
                      onDragEnd={async (event) => {
                        const node = event.target as Konva.Shape;
                        const x = (node.x() - board.x) / board.width;
                        const y = (node.y() - board.y) / board.height;
                        const pointer = node.getStage()?.getPointerPosition();
                        const toTray =
                          !!pointer &&
                          pointer.x >= tray.x &&
                          pointer.x <= tray.x + tray.width &&
                          pointer.y >= tray.y &&
                          pointer.y <= tray.y + tray.height;
                        expansion.current = null;
                        anchor.current = null;
                        setBusy(true);
                        try {
                          const granted = await (claimRef.current ||
                            Promise.resolve(true));
                          const success =
                            granted && (await move(piece.index, x, y, toTray));
                          if (success) {
                            const solved =
                              !toTray && isCorrectPlacement(piece, x, y);
                            const target = solved
                              ? { x: piece.x, y: piece.y }
                              : boundedPosition(x, y, columns, rows);
                            node.position(
                              toTray
                                ? trayPosition(piece.index)
                                : {
                                    x: board.x + target.x * board.width,
                                    y: board.y + target.y * board.height,
                                  },
                            );
                            node.scale({
                              x: toTray ? thumbnailScale : 1,
                              y: toTray ? thumbnailScale : 1,
                            });
                          } else {
                            node.position(originalPosition);
                            node.scale({ x: originalScale, y: originalScale });
                            if (granted && onRelease) {
                              const previous = positions[piece.index] || {
                                x: -1,
                                y: -1,
                              };
                              await onRelease(
                                piece.index,
                                previous.x,
                                previous.y,
                              );
                            }
                          }
                        } catch (error) {
                          node.position(originalPosition);
                          node.scale({ x: originalScale, y: originalScale });
                          setStatus(
                            error instanceof Error
                              ? error.message
                              : "This move could not be saved. Try again.",
                          );
                        } finally {
                          activeDrag.current = null;
                          setDragging(null);
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
        {reference && (
          <div className="puzzle-reference">
            <img src={image} alt="Reference for the complete puzzle" />
            <span>Take a closer look.</span>
          </div>
        )}
      </div>
      <div className="puzzle-table-footer">
        <p role="status" aria-live="polite">
          {status}
        </p>
        <div className="puzzle-pagination">
          <button
            type="button"
            aria-label="Previous pieces"
            disabled={safePage === 0 || busy || dragging !== null}
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
            disabled={safePage >= pageCount - 1 || busy || dragging !== null}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {placed.size < geometry.length && (
        <details className="puzzle-keyboard">
          <summary>Prefer to tap or use your keyboard?</summary>
          <p>
            Choose a piece, then a row and column. You can leave it there and
            move it again later. Matching pieces lock into place.
          </p>
          <div
            className="puzzle-piece-select"
            aria-label="Choose an unplaced piece"
          >
            {movableIndices.map((index) => (
              <button
                type="button"
                key={index}
                aria-label={`Select piece ${index + 1}`}
                aria-pressed={selected === index}
                disabled={busy || lockedElsewhere(index)}
                onClick={() => setSelected(index)}
                style={{
                  backgroundImage: `url("${image}")`,
                  backgroundSize: `${columns * 100}% ${rows * 100}%`,
                  backgroundPosition: `${(geometry[index].column / Math.max(1, columns - 1)) * 100}% ${(geometry[index].row / Math.max(1, rows - 1)) * 100}%`,
                }}
              >
                <span>
                  {index + 1}
                  {positions[index] ? " · on board" : ""}
                </span>
              </button>
            ))}
          </div>
          <div className="puzzle-keyboard-controls">
            <label>
              Row
              <select
                aria-label="Target row"
                value={targetRow}
                onChange={(event) => setTargetRow(Number(event.target.value))}
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
                onChange={(event) =>
                  setTargetColumn(Number(event.target.value))
                }
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
              disabled={selected === null || busy}
              onClick={() => void keyboardMove()}
            >
              {busy
                ? "Moving…"
                : selected === null
                  ? "Choose a piece"
                  : `Place piece ${selected + 1}`}
            </button>
            <button
              type="button"
              className="return-to-tray"
              disabled={selected === null || !positions[selected] || busy}
              onClick={() => void keyboardMove(true)}
            >
              <Undo2 size={15} /> Return to tray
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
