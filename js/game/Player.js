class Player extends Entity {
	index = -1;

	/** @type {Controller} */
	controller = null;

	constructor(index) {
		super();

		this.index = index;
		this.spriteOffsetY = -3;
	}

	#handleInput() {
		if (!this.controller)
			return;

		let dirX = 0;
		let dirY = 0;

		if (this.controller.dpad[0])
			dirY -= 1.0;

		if (this.controller.dpad[1])
			dirX += 1.0;

		if (this.controller.dpad[2])
			dirY += 1.0;

		if (this.controller.dpad[3])
			dirX -= 1.0;

		if (dirX && dirY) {
			//dirX *= Math.SQRT1_2;
			//dirY *= Math.SQRT1_2;
		}

		this.dirX = dirX;
		this.dirY = dirY;
	}

	tick(delta) {
		this.#handleInput();
	}
}
