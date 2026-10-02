/**
 * Where the dog is on the stage as its frames play, as `PopScript` places
 * each frame (DOGZDLL.DLL seg7:6e8e to 6f32; see kb/formats/scp.md):
 *
 * - glued by a ball, so that the ball stays where it was
 *   (`Ballz::MoveFrameRectBall`, inferred from its name: not yet read);
 * - after a reference frame, moved by the difference between the centres of
 *   the reference's rectangle and its own (`Ballz::GetCenterOffset`), which
 *   is how a walk carries the dog on from one cycle to the next;
 * - otherwise where its own coordinates put it (`Ballz::MoveFrameRect`).
 */

import { type AnimationHeader, type Frame } from '../formats/animation.ts';
import { type Breed } from '../formats/lnz.ts';
import { ballAt } from '../render/ballz.ts';
import { project, scalesForAge } from '../render/project.ts';
import { type PetWorld } from './pet.ts';
import { DEFAULT_GLUE, type Step } from './timeline.ts';

export class Stage implements PetWorld {
  /** The dog's origin on the stage, from its top left. */
  x: number;
  y: number;

  readonly width: number;
  readonly height: number;

  private frame: Frame;
  private rotation = 0;
  private readonly breed: Breed;
  private readonly header: AnimationHeader;
  private readonly frames: Frame[];
  private readonly age: number;

  constructor(
    width: number,
    height: number,
    breed: Breed,
    header: AnimationHeader,
    frames: Frame[],
    age = 0
  ) {
    this.width = width;
    this.height = height;
    this.breed = breed;
    this.header = header;
    this.frames = frames;
    this.age = age;
    this.x = width / 2;
    this.y = (height * 5) / 8;
    this.frame = frames[0];
  }

  private ball(frame: Frame, ball: number, rotation: number) {
    return ballAt(this.breed, this.header, frame, ball, { age: this.age, yaw: rotation });
  }

  /** The centre of the rectangle a frame is drawn in, from the dog's origin. */
  private centre(frame: Frame, rotation: number) {
    const placed = project(
      this.breed,
      this.header,
      frame,
      scalesForAge(this.breed, this.age),
      rotation,
      100 - this.age
    );
    const left = Math.min(...placed.map((ball) => ball.x - ball.diameter / 2));
    const right = Math.max(...placed.map((ball) => ball.x + ball.diameter / 2));
    const top = Math.min(...placed.map((ball) => ball.y - ball.diameter / 2));
    const bottom = Math.max(...placed.map((ball) => ball.y + ball.diameter / 2));
    return { x: Math.trunc((left + right) / 2), y: Math.trunc((top + bottom) / 2) };
  }

  /**
   * Moves on to a step's frame, turned to `rotation`: glued, or placed by a
   * reference frame, or where its own coordinates put it.
   */
  show(step: Step, rotation: number, reference?: number) {
    const next = this.frames[step.frame];

    if (step.glue !== undefined) {
      const before = this.ball(this.frame, step.glue, this.rotation);
      const after = this.ball(next, step.glue, rotation);
      this.x += before.x - after.x;
      this.y += before.y - after.y;
    } else if (reference !== undefined) {
      const from = this.centre(this.frames[reference], rotation);
      const to = this.centre(next, rotation);
      this.x += from.x - to.x;
      this.y += from.y - to.y;
    }

    this.frame = next;
    this.rotation = rotation;
  }

  /** Where the dog is: its belly, on the stage. */
  where() {
    const belly = this.ball(this.frame, DEFAULT_GLUE, this.rotation);
    return { x: this.x + belly.x, y: this.y + belly.y };
  }

  /**
   * The rotation that points the dog's head, from its belly, most nearly at
   * a point on the stage: the way it then walks. Found by trying every
   * sixteenth of a turn on the frame it is showing.
   */
  aim(target: { x: number; y: number }) {
    const head = this.breed.keyBalls[0];
    const at = this.where();
    const want = Math.atan2(target.y - at.y, target.x - at.x);
    let best = 0;
    let closest = Infinity;

    for (let rotation = -128; rotation < 128; rotation += 16) {
      const from = this.ball(this.frame, DEFAULT_GLUE, rotation);
      const to = this.ball(this.frame, head, rotation);
      const angle = Math.atan2(to.y - from.y, to.x - from.x) - want;
      const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));

      if (off < closest) {
        closest = off;
        best = rotation;
      }
    }

    return best;
  }
}
