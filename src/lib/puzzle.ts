import { DIFFICULTIES } from "./types";
import type { Difficulty } from "./types";

export type Edge = -1 | 0 | 1;
export interface PuzzlePiece {
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  top: Edge;
  right: Edge;
  bottom: Edge;
  left: Edge;
}
export const SNAP_RADIUS = 0.035;

export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++)
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generatePieces(
  difficulty: Difficulty,
  seed: string,
): PuzzlePiece[] {
  const { rows, columns } = DIFFICULTIES[difficulty];
  const random = seededRandom(seed);
  const pieces: PuzzlePiece[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const edge = (): Edge => (random() > 0.5 ? 1 : -1);
      pieces.push({
        index,
        row,
        column,
        x: column / columns,
        y: row / rows,
        top: row === 0 ? 0 : (-pieces[index - columns].bottom as Edge),
        left: column === 0 ? 0 : (-pieces[index - 1].right as Edge),
        right: column === columns - 1 ? 0 : edge(),
        bottom: row === rows - 1 ? 0 : edge(),
      });
    }
  }
  return pieces;
}

export function isCorrectPlacement(
  piece: Pick<PuzzlePiece, "x" | "y">,
  x: number,
  y: number,
): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Math.hypot(piece.x - x, piece.y - y) <= SNAP_RADIUS
  );
}

export function shuffledIndices(length: number, seed: string): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  const random = seededRandom(`${seed}:tray`);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

interface PathContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  closePath(): void;
}

/** Symmetric edge profiles remain complementary when traversed in reverse. */
export function tracePiece(
  context: PathContext,
  piece: PuzzlePiece,
  width: number,
  height: number,
): void {
  context.beginPath();
  context.moveTo(0, 0);
  const depth = Math.min(width, height) * 0.22;
  const side = (
    startX: number,
    startY: number,
    dx: number,
    dy: number,
    edge: Edge,
  ) => {
    const length = Math.hypot(dx, dy);
    const point = (t: number, n: number) =>
      [
        startX + dx * t + (dy / length) * n,
        startY + dy * t - (dx / length) * n,
      ] as const;
    const line = (t: number, n = 0) => context.lineTo(...point(t, n));
    const curve = (
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
    ) => context.bezierCurveTo(...point(a, b), ...point(c, d), ...point(e, f));
    if (edge === 0) {
      line(1);
      return;
    }
    const n = depth * edge;
    line(0.34);
    curve(0.42, 0, 0.42, 0, 0.4, n * 0.35);
    curve(0.34, n * 0.95, 0.45, n * 1.15, 0.5, n);
    curve(0.55, n * 1.15, 0.66, n * 0.95, 0.6, n * 0.35);
    curve(0.58, 0, 0.58, 0, 0.66, 0);
    line(1);
  };
  side(0, 0, width, 0, piece.top);
  side(width, 0, 0, height, piece.right);
  side(width, height, -width, 0, piece.bottom);
  side(0, height, 0, -height, piece.left);
  context.closePath();
}
