// Pure tuning data for the 3D hall: chapter colours, mood, crowd flow and THE CAMERA PATH (one array, tune it here).
// Colours: ice = real people, hot = bots, lime = let in, gold = Fair Drop, violet = sealed things.
export const STAGES = 8; // chapters: hero, problem, bots, journey, methods, how, proof, shows
export type V3 = [number, number, number];
export const ICE: V3 = [0.5, 0.85, 1], HOT: V3 = [1, 0.23, 0.36], LIME: V3 = [0.72, 1, 0.29], GOLD: V3 = [1, 0.76, 0.2], VIOLET: V3 = [0.55, 0.42, 1];

/** Camera keyframes along the scroll. u = chapter index + progress (0..8). p = camera, l = look-at target, fov (vertical, desktop),
 *  sx = push the hall to the right by this fraction of the width (desktop, keeps the headline column clear),
 *  sy = push it up by this fraction of the height (phones, text sits at the bottom).
 *  Positions are world metres: stage at z = -30, seats fan out toward +z, the three entrance gates are at z ~ +6..+10 (rear).
 *  Motion between keys is a velocity-continuous spline, so the fly-through never stops dead. */
export type Key = { u: number; p: V3; l: V3; fov: number; sx: number; sy: number };
export const PATH: Key[] = [
  // 0 hero: wide shot from the rear balcony, hall on the right of the frame
  { u: 0.0, p: [-12, 11.8, 2], l: [-8, 2.8, -22], fov: 54, sx: 0.14, sy: 0.2 },
  { u: 0.9, p: [-8, 11.6, 1], l: [-6, 3, -22], fov: 52, sx: 0.14, sy: 0.2 },
  // 1 problem: slow push-in over the rear rows toward the stage
  { u: 1.5, p: [3, 10.2, 3], l: [0, 4.2, -30], fov: 44, sx: 0.08, sy: 0.12 },
  // 2 bots: low dolly down the centre aisle
  { u: 2.0, p: [0.5, 8.9, 5], l: [0, 5.2, -30], fov: 48, sx: 0, sy: 0.05 },
  { u: 2.5, p: [0.3, 5.7, -3], l: [0, 4.6, -30], fov: 50, sx: 0, sy: 0.05 },
  { u: 3.0, p: [0.1, 3.0, -11], l: [0, 4.4, -30], fov: 52, sx: 0, sy: 0.05 },
  // 3 journey: reverse out through the gate, then orbit past the entrance arches
  { u: 3.3, p: [-16, 10, 38], l: [0, 6, 4], fov: 52, sx: 0.05, sy: 0.08 },
  { u: 3.55, p: [0, 10.5, 42], l: [0, 6, 4], fov: 52, sx: 0.05, sy: 0.08 },
  { u: 3.8, p: [16, 10, 38], l: [0, 6, 4], fov: 52, sx: 0.05, sy: 0.08 },
  { u: 4.05, p: [9, 17, 34], l: [0, 4, -15], fov: 46, sx: 0.03, sy: 0.08 },
  // 4 three ways: high crane over the whole hall
  { u: 4.5, p: [0, 28, 34], l: [0, 3, -16], fov: 46, sx: 0.03, sy: 0.1 },
  { u: 4.85, p: [-3, 24, 28], l: [0, 3, -18], fov: 44, sx: 0.03, sy: 0.1 },
  // 5 what we do: sweep along the front row as the seats fill gold
  { u: 5.2, p: [-9.2, 3.6, -19.1], l: [-10.4, 4.6, -7], fov: 56, sx: 0, sy: 0.05 },
  { u: 5.55, p: [0, 3.6, -15.7], l: [2.4, 4.4, -5], fov: 56, sx: 0, sy: 0.05 },
  { u: 5.9, p: [9.2, 3.6, -19.1], l: [19.5, 4.6, -15], fov: 56, sx: 0, sy: 0.05 },
  // 6 proof: pull back to the full-hall hero shot, bathed in gold
  { u: 6.35, p: [7, 25, 27], l: [0, 3.5, -26], fov: 50, sx: 0.04, sy: 0.1 },
  { u: 6.9, p: [-5, 24, 25], l: [0, 3.5, -26], fov: 50, sx: 0.04, sy: 0.1 },
  // 7 limits / the end: slow settle
  { u: 7.5, p: [5, 15, 24], l: [1, 4.5, -28], fov: 48, sx: 0.08, sy: 0.12 },
  { u: 8.0, p: [3, 14.5, 22], l: [0, 4.5, -28], fov: 48, sx: 0.08, sy: 0.12 },
];

// ---- per chapter values (blended smoothly into the next chapter)
export const MOOD = {
  expo: [1.2, 1.0, 1.0, 1.0, 0.95, 1.0, 1.1, 1.0],
  vig: [0.3, 0.5, 0.5, 0.5, 0.55, 0.5, 0.5, 0.55], // CSS edge vignette strength
  wash: [1, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35], // CSS soft blur + dark behind the left text column
  fill: [0.1, 0.12, 0.2, 0.3, 0.5, 0.68, 0.9, 0.9], // share of the seats that are gold
  rate: [5, 12, 20, 16, 14, 12, 10, 6], // people per second through the gates
  bots: [0.04, 0.09, 0.14, 0.07, 0.07, 0.05, 0.04, 0.04], // share of the arrivals that are bots
  pace: [0.85, 1, 1.05, 1, 1, 1, 0.95, 0.85], // walking speed multiplier
  keyI: [3.0, 2.8, 2.8, 2.8, 3.0, 3.0, 3.4, 3.0],
};
export const KEYCOL: V3[] = [[1, 0.72, 0.38], [1, 0.34, 0.42], [1, 0.34, 0.42], [0.62, 0.74, 1], [1, 0.74, 0.46], [0.72, 0.58, 1], [1, 0.8, 0.32], [1, 0.74, 0.4]];

// beams: five colours per chapter + intensity
const c = (r: number, g: number, b: number) => [r, g, b] as V3;
export const BEAM: { cols: V3[]; i: number }[] = [
  { cols: [GOLD, VIOLET, GOLD, VIOLET, GOLD], i: 1 },
  { cols: [HOT, HOT, VIOLET, HOT, HOT], i: 0.85 },
  { cols: [HOT, c(1, 0.54, 0.24), VIOLET, HOT, VIOLET], i: 0.7 },
  { cols: [VIOLET, ICE, VIOLET, ICE, VIOLET], i: 0.7 },
  { cols: [HOT, VIOLET, VIOLET, GOLD, GOLD], i: 0.7 },
  { cols: [VIOLET, GOLD, VIOLET, GOLD, VIOLET], i: 0.65 },
  { cols: [GOLD, GOLD, GOLD, LIME, GOLD], i: 0.85 },
  { cols: [GOLD, VIOLET, GOLD, VIOLET, GOLD], i: 0.6 },
];
