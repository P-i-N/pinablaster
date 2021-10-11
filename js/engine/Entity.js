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

	lastAppliedDirX = 0;
	lastAppliedDirY = 0;

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

	getOccupiedBlockRange(applyDir = false, clamp = false) {
		let x = this.x;
		let y = this.y;

		if (applyDir) {
			x += this.dirX;
			y += this.dirY;
		}

		let result = {
			x1: Math.floor(x / this.world.sprites.spriteWidth),
			y1: Math.floor(y / this.world.sprites.spriteHeight),
			x2: Math.floor((x + this.width) / this.world.sprites.spriteWidth),
			y2: Math.floor((y + this.height) / this.world.sprites.spriteHeight)
		};

		if (Math.trunc(x) == x && !((x + this.width) % this.world.sprites.spriteWidth))
			--result.x2;

		if (Math.trunc(y) == y && !((y + this.height) % this.world.sprites.spriteHeight))
			--result.y2;

		if (clamp) {
			if (result.x1 < 0)
				result.x1 = 0;
			else if (result.x1 >= this.world.width)
				result.x1 = this.world.width - 1;

			if (result.y1 < 0)
				result.y1 = 0;
			else if (result.y1 >= this.world.height)
				result.y1 = this.world.height - 1;
			
			if (result.x2 < 0)
				result.x2 = 0;
			else if (result.x2 >= this.world.width)
				result.x2 = this.world.width - 1;
			
			if (result.y2 < 0)
				result.y2 = 0;
			else if (result.y2 >= this.world.height)
				result.y2 = this.world.height - 1;
		}

		return result;
	}
}
