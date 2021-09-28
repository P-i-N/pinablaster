class Sprite {
	/** @type {SpriteSheet} */
	spriteSheet = null;

	frames = [];
	baseIndex = 0;
	animationSpeed = 1.0;
	loop = true;
	isFinished = false;

	alpha = 1.0;
	hueShift = 0;

	#phase = 0.0;

	constructor(spriteSheet) {
		this.spriteSheet = spriteSheet;
	}

	getCurrentFrame() {
		if (!this.frames || this.frames.length == 0)
			return this.baseIndex;

		if (this.#phase <= 0.0)
			return this.baseIndex + this.frames[0];

		if (this.#phase >= this.frames.length - 1)
			return this.baseIndex + this.frames[this.frames.length - 1];

		return this.baseIndex + this.frames[Math.floor(this.#phase)];
	}

	tick(delta) {
		this.#phase += delta * this.animationSpeed * this.frames.length;

		if (this.#phase >= this.frames.length) {
			if (this.loop) {
				this.#phase -= this.frames.length;
				this.isFinished = false;
			}
			else {
				this.#phase = this.frames.length;
				this.isFinished = true;
			}
		}
	}

	render(ctx, x, y, scale = 1.0) {
		if (!this.spriteSheet)
			return;

		let frame = this.getCurrentFrame();

		this.spriteSheet.drawSpriteIndex(ctx, x, y, frame, scale);
	}
}
