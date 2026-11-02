import { describe, expect, it } from "vitest";
import {
  generatePieces,
  isCorrectPlacement,
  seededRandom,
  shuffledIndices,
  tracePiece,
} from "./puzzle";
import { DIFFICULTIES } from "./types";
import type { Difficulty } from "./types";

describe("deterministic puzzle geometry", () => {
  for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[]) {
    it(`builds ${difficulty} with complementary internal edges and flat borders`, () => {
      const { rows, columns, pieces: total } = DIFFICULTIES[difficulty];
      const pieces = generatePieces(difficulty, "museum");
      expect(pieces).toHaveLength(total);
      expect(pieces).toEqual(generatePieces(difficulty, "museum"));
      for (const p of pieces) {
        if (p.column === 0) expect(p.left).toBe(0);
        else expect(p.left).toBe(-pieces[p.index - 1].right);
        if (p.row === 0) expect(p.top).toBe(0);
        else expect(p.top).toBe(-pieces[p.index - columns].bottom);
        if (p.column === columns - 1) expect(p.right).toBe(0);
        if (p.row === rows - 1) expect(p.bottom).toBe(0);
        expect(p.x).toBe(p.column / columns);
        expect(p.y).toBe(p.row / rows);
      }
    });
  }
  it("changes the internal edges with the game seed", () => {
    expect(generatePieces("medium", "first")).not.toEqual(
      generatePieces("medium", "second"),
    );
  });
  it("shuffles every piece once and reproduces the same tray", () => {
    const order = shuffledIndices(120, "gallery");
    expect(new Set(order).size).toBe(120);
    expect(order).toEqual(shuffledIndices(120, "gallery"));
    expect(order).not.toEqual(Array.from({ length: 120 }, (_, i) => i));
    expect(seededRandom("a")()).toBeGreaterThanOrEqual(0);
  });
  it("snaps only finite positions within the normalized radius", () => {
    const piece = generatePieces("easy", "a")[5];
    expect(isCorrectPlacement(piece, piece.x, piece.y)).toBe(true);
    expect(isCorrectPlacement(piece, piece.x + 0.02, piece.y)).toBe(true);
    expect(isCorrectPlacement(piece, piece.x + 0.03, piece.y + 0.03)).toBe(
      false,
    );
    expect(isCorrectPlacement(piece, NaN, piece.y)).toBe(false);
    expect(isCorrectPlacement(piece, Infinity, piece.y)).toBe(false);
  });
  it("traces a closed curved path for a jigsaw piece", () => {
    const commands: string[] = [];
    tracePiece(
      {
        beginPath: () => commands.push("begin"),
        moveTo: () => commands.push("move"),
        lineTo: () => commands.push("line"),
        bezierCurveTo: () => commands.push("curve"),
        closePath: () => commands.push("close"),
      },
      generatePieces("easy", "a")[5],
      180,
      180,
    );
    expect(commands[0]).toBe("begin");
    expect(commands).toContain("curve");
    expect(commands.at(-1)).toBe("close");
  });
});
