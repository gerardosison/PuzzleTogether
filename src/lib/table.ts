import type { PieceState } from "./types";
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface TableLayout {
  width: number;
  height: number;
  board: Rect;
  tray: Rect;
  columns: number;
  rows: number;
  pageSize: number;
  side: boolean;
}
/** Fits the painting and a distinct, always-visible piece tray into the available screen. */
export function tableLayout(
  width: number,
  height: number,
  ratio: number,
): TableLayout {
  const side = width >= 680 || width / height > 1.65;
  const padding = Math.min(18, width * 0.025);
  const gap = Math.min(24, width * 0.025);
  const trayWidth = Math.min(245, Math.max(146, width * 0.25));
  const trayHeight = Math.min(160, Math.max(84, height * 0.32));
  const area = side
    ? {
        x: padding,
        y: padding,
        width: width - trayWidth - gap - padding * 2,
        height: height - padding * 2,
      }
    : {
        x: padding,
        y: padding,
        width: width - padding * 2,
        height: height - trayHeight - gap - padding * 2,
      };
  const boardWidth = Math.min(area.width, area.height * ratio);
  const boardHeight = boardWidth / ratio;
  const board = {
    x: area.x + (area.width - boardWidth) / 2,
    y: area.y + (area.height - boardHeight) / 2,
    width: boardWidth,
    height: boardHeight,
  };
  const tray = side
    ? {
        x: width - trayWidth - padding,
        y: padding,
        width: trayWidth,
        height: height - padding * 2,
      }
    : {
        x: padding,
        y: height - trayHeight - padding,
        width: width - padding * 2,
        height: trayHeight,
      };
  const columns = side
    ? Math.max(2, Math.min(3, Math.floor(tray.width / 72)))
    : Math.max(3, Math.min(6, Math.floor(tray.width / 60)));
  const rows = side
    ? Math.max(1, Math.min(6, Math.floor((tray.height - 26) / 64)))
    : Math.max(1, Math.min(2, Math.floor((tray.height - 26) / 44)));
  return {
    width,
    height,
    board,
    tray,
    columns,
    rows,
    pageSize: columns * rows,
    side,
  };
}
export function boundedPosition(
  x: number,
  y: number,
  columns: number,
  rows: number,
): Point {
  return {
    x: Math.min(1 - 1 / columns, Math.max(0, x)),
    y: Math.min(1 - 1 / rows, Math.max(0, y)),
  };
}
export function isOnBoard(
  piece: Pick<PieceState, "x" | "y">,
  columns: number,
  rows: number,
): boolean {
  return (
    Number.isFinite(piece.x) &&
    Number.isFinite(piece.y) &&
    piece.x >= 0 &&
    piece.x <= 1 - 1 / columns &&
    piece.y >= 0 &&
    piece.y <= 1 - 1 / rows
  );
}
export function loadPositions(
  storageKey: string | undefined,
  total: number,
  columns: number,
  rows: number,
): Record<number, Point> {
  if (!storageKey) return {};
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(`${storageKey}:positions`) || "{}",
    );
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([index, value]) =>
          Number.isInteger(Number(index)) &&
          Number(index) >= 0 &&
          Number(index) < total &&
          value &&
          typeof value === "object" &&
          isOnBoard(value as Point, columns, rows),
      ),
    );
  } catch {
    return {};
  }
}
