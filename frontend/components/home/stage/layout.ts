// Shared geometry of the hall (metres). The stage centre is at z = CZ, the audience fans out around it in arcs.
// Polar helper: x = R sin(th), z = CZ + R cos(th); th = 0 looks from the stage straight back to the rear gates.
export const CZ = -30, ARC = 0.82, ROWS = 14;
export const AIS = [-0.42, 0, 0.42]; // aisle angles = gate angles
export const HALF_AISLE = 1.15;
export const rowR = (r: number) => 16 + r * 1.45 + (r >= 8 ? 1.6 : 0); // cross-aisle between row 7 and 8 (the balcony starts at 8)
export const rowY = (r: number) => 0.3 + r * 0.42 + (r >= 8 ? 0.6 : 0);
export const treadStart = (r: number) => rowR(r) - 0.75;
export const REAR_R = rowR(ROWS - 1) + 0.72;
export const GATE_R = 40, WALL_R = 41.6, GATE_Y = rowY(ROWS - 1);
export const polar = (R: number, th: number, y: number): [number, number, number] => [Math.sin(th) * R, y, CZ + Math.cos(th) * R];

const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** floor height at radius R, with a short ramp over each step so walkers do not teleport */
export function yWalk(R: number) {
  if (R < treadStart(0)) return 0;
  if (R >= REAR_R) return GATE_Y;
  let r = ROWS - 1; while (r > 0 && treadStart(r) > R) r--;
  const prev = r > 0 ? rowY(r - 1) : 0;
  return prev + (rowY(r) - prev) * ss(0, 0.35, R - treadStart(r));
}

export type Seat = { x: number; y: number; z: number; th: number; R: number; row: number; aisle: number };
