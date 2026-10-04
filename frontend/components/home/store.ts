// Shared mutable scroll state. The page (GSAP ScrollTrigger) writes it, the 3D stage reads it every frame.
// u = chapter index + progress inside that chapter (0..8). Nothing here causes React renders.
export const prog = {
  u: 0,
  reduced: false,
  visible: true,
  ping: null as null | (() => void), // set by the stage: asks for one frame (used when frameloop="demand")
};

// chapter order shared by the page and the stage
export const CHAPTERS = ["hero", "problem", "bots", "journey", "methods", "how", "proof", "shows"] as const;
