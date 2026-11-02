import { describe, expect, it } from "vitest";
import { boundedPosition, isOnBoard, tableLayout } from "./table";

describe("viewport fitted puzzle table", () => {
  it.each([
    [280, 230],
    [350, 480],
    [680, 640],
    [1254, 480],
    [1700, 600],
    [804, 160],
  ])("keeps board and tray distinct inside a %dx%d canvas", (width, height) => {
    for (const ratio of [0.65, 1.26, 1.8, 2.5]) {
      const { board, tray, pageSize } = tableLayout(width, height, ratio);
      for (const rect of [board, tray]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width + 0.001);
        expect(rect.y + rect.height).toBeLessThanOrEqual(height + 0.001);
      }
      expect(board.width / board.height).toBeCloseTo(ratio, 8);
      expect(
        board.x + board.width <= tray.x || board.y + board.height <= tray.y,
      ).toBe(true);
      expect(pageSize).toBeGreaterThan(0);
    }
  });
  it("bounds a loose piece without moving it to its solution", () => {
    expect(boundedPosition(0.19, 0.25, 4, 3)).toEqual({ x: 0.19, y: 0.25 });
    expect(boundedPosition(2, -1, 4, 3)).toEqual({ x: 0.75, y: 0 });
    expect(isOnBoard({ x: 0.19, y: 0.25 }, 4, 3)).toBe(true);
    expect(isOnBoard({ x: -1, y: -1 }, 4, 3)).toBe(false);
    expect(isOnBoard({ x: NaN, y: 0 }, 4, 3)).toBe(false);
    expect(isOnBoard({ x: 0.9, y: 0 }, 4, 3)).toBe(false);
  });
});
