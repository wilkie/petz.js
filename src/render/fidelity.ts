/**
 * How faithfully the dog is drawn: each of the engine's accidents that
 * shows in the drawing, by name, to keep as Dogz drew on the oracle or to
 * draw as was evidently meant. Each is read out and measured against the
 * oracle in kb/topics/fidelity.md, which names the probe that shows it
 * (scripts/oracle/probes.json). Design — the toe the dog holds things by,
 * the eye drawn over the head, the frames' extras — is kept either way.
 */

export interface Fidelity {
  /** Sines made with the engine's π, 3.1415, so a quarter turn's is 255; else the true one. */
  shortPi: boolean;

  /** The screen's bitmap bottom-up, as WinG recommended on the oracle; else top-down. */
  bottomUp: boolean;

  /** Each diameter's rows moved by the last move of the diameter before (`InitCircleLookup`); else not. */
  carriedFuzz: boolean;

  /** The iris kept within the eye's radius less 0.8 of the eye's, and set a pixel left; else by the iris's, centred. */
  irisAsDrawn: boolean;

  /** `ZOrder`'s partial sort, kept from frame to frame; else sorted by depth afresh each frame. */
  partialSort: boolean;

  /** Windows' dark static colours as the oracle's display drivers show them — at 192 on 256 colours, the VGA driver's own on 16 — else as Dogz's palettes have them. */
  driverColours: boolean;

  /** Catz's averaged breeds without their Move Up list, as `AverageBallMoveList` clears it (seg39:3245); else averaged as the others. */
  averageLosesUp: boolean;
}

/** As Dogz draws on the oracle. */
export const DOGZ: Fidelity = {
  shortPi: true,
  bottomUp: true,
  carriedFuzz: true,
  irisAsDrawn: true,
  partialSort: true,
  driverColours: true,
  averageLosesUp: true,
};

/** As evidently meant. */
export const MODERN: Fidelity = {
  shortPi: false,
  bottomUp: false,
  carriedFuzz: false,
  irisAsDrawn: false,
  partialSort: false,
  driverColours: false,
  averageLosesUp: false,
};

/** How the dog is drawn now: Dogz's way unless set otherwise. */
export const FIDELITY: Fidelity = { ...DOGZ };

/** Draws as `fidelity` says from now on. */
export function setFidelity(fidelity: Partial<Fidelity>) {
  Object.assign(FIDELITY, fidelity);
}
