class Entity {
	/** @type {World} */
	world = null;

	/** @type {Entity} */
	owner = null;

	/** @type {Sprite} */
	sprite = null;

	x = 0;
	y = 0;
	width = 1;
	height = 1;

	spriteOffsetX = 0;
	spriteOffsetY = 0;

	touchBorder = 0;

	solid = true;
	pushable = false;
	canPush = false;

	// 0 - not moving, 1 - up, 2 - right, 3 - down, 4 - left
	direction = 0;
	nextDirection = 0;
	lastDirection = 0;

	dirX = 0;
	dirY = 0;

	speed = 1.0;
	
	correctMovement = false;

	constructor() {

	}

	tick(delta) {
		if (this.sprite)
			this.sprite.tick(delta);
	}

	render(ctx, scale = 1.0) {
		if (this.sprite) {
			this.sprite.render(
				ctx,
				Math.floor((this.x + this.spriteOffsetX) * scale),
				Math.floor((this.y + this.spriteOffsetY) * scale),
				scale);
		}
	}

	setDirection(dir) {
		if (this.direction == dir || this.nextDirection == dir)
			return;

		this.nextDirection = dir;
	}

	resetDirection(dir) {
		if (this.direction == dir && this.nextDirection == 0)
			this.direction = 0;
		else if (this.nextDirection == dir)
			this.nextDirection = 0;
	}
}
