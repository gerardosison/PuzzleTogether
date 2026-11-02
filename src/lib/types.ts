export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: Record<
  Difficulty,
  { rows: number; columns: number; pieces: number; label: string }
> = {
  easy: { rows: 3, columns: 4, pieces: 12, label: "A little pause" },
  medium: { rows: 6, columns: 8, pieces: 48, label: "Settle in" },
  hard: { rows: 10, columns: 12, pieces: 120, label: "Take your time" },
};
export interface Artwork {
  id: string;
  title: string;
  artist: string;
  year: string;
  image: string;
  category: "Paintings" | "Architecture" | "Nature";
  description: string;
  credit: string;
}
export interface PieceState {
  index: number;
  x: number;
  y: number;
  placed: boolean;
  lockedBy?: string | null;
  placedBy?: string | null;
  version?: number;
}
export interface PuzzleBoardProps {
  image: string;
  difficulty: Difficulty;
  seed: string;
  pieces?: PieceState[];
  onPlace?: (index: number, x: number, y: number) => Promise<boolean>;
  onClaim?: (index: number) => Promise<boolean>;
  onRelease?: (index: number, x: number, y: number) => void;
  onMove?: (index: number, x: number, y: number) => void;
  onRenew?: (index: number) => void;
  onProgress?: (placed: number, total: number) => void;
  onComplete?: () => void;
  storageKey?: string;
  userId?: string;
}
