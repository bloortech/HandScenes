// Loop-recorder tap for the vocal booth.
//
// Runs on the audio thread and forwards the voice in blocks, each stamped with
// its absolute frame index (`currentFrame`). That stamp is what lets the main
// thread cut a loop on the exact sample the downbeat fell on — a plain
// MediaRecorder gives no such reference and would smear the loop point.
const BLOCK = 4096;

class RecTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.buf = new Float32Array(BLOCK);
    this.n = 0;
    this.startFrame = 0;
    this.port.onmessage = (e) => {
      if (typeof e.data.on !== 'boolean') return;
      if (!e.data.on && this.n > 0) this.flush();      // don't lose the tail
      this.on = e.data.on;
      this.n = 0;
    };
  }

  flush() {
    this.port.postMessage({ f: this.startFrame, d: this.buf.slice(0, this.n) });
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!this.on || !ch) return true;
    for (let i = 0; i < ch.length; i++) {
      if (this.n === 0) this.startFrame = currentFrame + i;
      this.buf[this.n++] = ch[i];
      if (this.n === BLOCK) { this.flush(); this.n = 0; }
    }
    return true;
  }
}

registerProcessor('rec-tap', RecTap);
