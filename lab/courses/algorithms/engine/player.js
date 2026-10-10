// Frame player: play/pause/step/scrub/speed over a pre-drained list of
// frames. DOM-facing (uses window.matchMedia + requestAnimationFrame).
import { reducedMotion } from './renderer.js';

export class Player {
  constructor({ frames, onFrame, onPlayStateChange }) {
    this.frames = frames;
    this.onFrame = onFrame || (() => {});
    this.onPlayStateChange = onPlayStateChange || (() => {});
    this.index = 0;
    this.playing = false;
    this.speed = 1; // frames per tick multiplier
    this.baseIntervalMs = reducedMotion() ? 120 : 420;
    this._timer = null;
  }

  get length() {
    return this.frames.length;
  }

  _emit() {
    this.onFrame(this.frames[this.index], this.index);
  }

  goTo(i) {
    this.index = Math.max(0, Math.min(this.frames.length - 1, i));
    this._emit();
  }

  stepForward() {
    if (this.index < this.frames.length - 1) {
      this.index++;
      this._emit();
      return true;
    }
    this.pause();
    return false;
  }

  stepBack() {
    if (this.index > 0) {
      this.index--;
      this._emit();
      return true;
    }
    return false;
  }

  setSpeed(mult) {
    this.speed = mult;
    if (this.playing) {
      this.pause();
      this.play();
    }
  }

  play() {
    if (this.playing) return;
    if (this.index >= this.frames.length - 1) this.index = 0;
    this.playing = true;
    this.onPlayStateChange(true);
    const tick = () => {
      if (!this.playing) return;
      const advanced = this.stepForward();
      if (!advanced) {
        this.pause();
        return;
      }
      this._timer = setTimeout(tick, this.baseIntervalMs / this.speed);
    };
    this._timer = setTimeout(tick, this.baseIntervalMs / this.speed);
  }

  pause() {
    this.playing = false;
    this.onPlayStateChange(false);
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  destroy() {
    this.pause();
  }
}

// Drains a topic's generator (from run(input)) into a frames array plus
// the final result. Topics are expected to produce a bounded number of
// frames for sandbox-sized inputs, so eager draining keeps the player
// simple (scrub = array index, no re-running the algorithm).
export function drain(generator) {
  const frames = [];
  let next = generator.next();
  while (!next.done) {
    frames.push(next.value);
    next = generator.next();
  }
  return { frames, result: next.value };
}
