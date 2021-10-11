class World {
	#entitiesToAdd = [];
	#entitiesToRemove = [];

	entities = [];
	width = 0;
	height = 0;
	cameraX = 0;
	cameraY = 0;
	zoom = 1.0;

	canvas = null;
	canvasContext = null;
	scale = 1;

	/** @type {SpriteSheet} */
	sprites = null;

	baseSpriteIndex = 0;

	blocks = [];
	colliders = [];

	debugDrawBBoxes = true;
	debugDrawColliders = true;

	constructor(sprites, scale = 1) {
		this.sprites = sprites;
		this.scale = scale;
		this.canvas = document.createElement("canvas");
		this.canvasContext = this.canvas.getContext("2d");
		this.canvasContext.imageSmoothingEnabled = false;
	}

	init(width, height) {
		this.width = width;
		this.height = height;
		this.canvas.width = this.sprites.spriteWidth * this.width * this.scale;
		this.canvas.height = this.sprites.spriteHeight * this.height * this.scale;
		this.canvasContext.imageSmoothingEnabled = false;

		this.cameraX = this.sprites.spriteWidth * this.width  / 2;
		this.cameraY = this.sprites.spriteHeight * this.height / 2;

		this.blocks = new Array(width);
		this.colliders = new Array(width);
		for (let x = 0; x < width; ++x) {
			this.blocks[x] = new Array(height);
			this.colliders[x] = new Array(height);
			for (let y = 0; y < height; ++y) {
				this.blocks[x][y] = 0;
				this.colliders[x][y] = false;
			}
		}

		this.entities = [];
		this.#entitiesToAdd = [];
		this.#entitiesToRemove = [];
	}

	addEntity(e) {
		if (!e)
			return;

		if (e.world)
			throw "Entity already belongs to a world!";

		e.world = this;
		this.#entitiesToAdd.push(e);

		let toRemoveIndex = this.#entitiesToRemove.indexOf(e);
		if (toRemoveIndex >= 0)
			this.#entitiesToRemove.splice(toRemoveIndex, 1);
	}

	removeEntity(e) {
		if (!e)
			return;

		if (e.world != this)
			throw "Entity does not belong to this world!";

		e.world = null;
		this.#entitiesToRemove.push(e);

		let toAddIndex = this.#entitiesToAdd.indexOf(e);
		if (toAddIndex >= 0)
			this.#entitiesToAdd.splice(toAddIndex, 1);
	}

	#addOrRemoveEntities() {
		this.#entitiesToAdd.forEach(e => { this.entities.push(e); });
		this.#entitiesToAdd = [];

		this.#entitiesToRemove.forEach(e => {
			let index = this.entities.indexOf(e);
			if (index >= 0)
				this.entities.splice(index, 1);
		});
		this.#entitiesToRemove = [];
	}

	isBlockOccupied(x, y) {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height)
			return true;

		return this.colliders[Math.floor(x)][Math.floor(y)];
	}

	#slideEntityAroundRect(e, dirX, dirY, x1, y1, x2, y2) {
		let x = e.x + dirX;
		let y = e.y + dirY;

		if (dirX) {
			let dx = 0;
			let distLeft = x2 - x;
			let distRight = x1 - (x + e.width);

			debugPrint(`distLeft=${distLeft}`);
			debugPrint(`distRight=${distRight}`);
	
			// Left side colliding
			if (distLeft >= 0 && x + e.width > x2) {
				dx += distLeft;
			}
			
			// Right side colliding
			if (distRight < 0 && x <= x1) {
				dx += distRight;
			}

			return dx;
		}

		if (dirY) {
			let dy = 0;
			let distTop = y2 - y;
			let distBottom = y1 - (y + e.height);

			debugPrint(`distTop=${distTop}`);
			debugPrint(`distBottom=${distBottom}`);
	
			// Top side colliding
			if (distTop > 0 && y + e.height > y2) {
				dy += distTop;
			}

			// Bottom side colliding
			if (distBottom < 0 && y <= y1) {
				dy += distBottom;
			}

			return dy;
		}

		return 0;
	}

	/**
	 * @param {Entity} e 
	 * @param {number} delta 
	 */
	#handleEntityMovement(e, delta) {
		{
			let range = e.getOccupiedBlockRange(true, true);
			debugPrint(`${range.x1} ${range.y1} ${range.x2} ${range.y2}`);
			debugPrint(`${e.lastAppliedDirX} ${e.lastAppliedDirY}`);
		}

		let dirX = e.dirX;
		let dirY = e.dirY;
		e.dirX = 0;
		e.dirY = 0;

		let firstAxis = 0;

		if (dirX && dirY) {
			if (e.lastAppliedDirX && !e.lastAppliedDirY)
				firstAxis = 1;
			else if (!e.lastAppliedDirX && e.lastAppliedDirY)
				firstAxis = 0;
		}

		for (let axis = firstAxis; axis < firstAxis + 2; ++axis) {
			// Solve X axis
			if (((axis % 2) == 0) && dirX) {
				e.dirX = dirX;
				e.dirY = 0;
				let range = e.getOccupiedBlockRange(true, true);
				for (let by = range.y1; by <= range.y2; ++by)
					for (var bx = range.x1; bx <= range.x2; ++bx)
						if (this.isBlockOccupied(bx, by)) {
							dirX += this.#slideEntityAroundRect(e, dirX, 0,
								bx * this.sprites.spriteWidth, by * this.sprites.spriteHeight,
								(bx + 1) * this.sprites.spriteWidth, (by + 1) * this.sprites.spriteHeight);
						}
				
				if (e.dirX - dirX)
						dirY /= Math.SQRT1_2;

				if (Math.abs(dirX - Math.round(dirX)) < 0.001)
					dirX = Math.round(dirX);

				e.x += dirX;
				let roundDiff = Math.abs(e.x - Math.round(e.x));
				if (roundDiff < 0.001)
						e.x = Math.round(e.x);
			}

			// Solve Y axis
			if (((axis % 2) == 1) && dirY) {
				e.dirX = 0;
				e.dirY = dirY;
				let range = e.getOccupiedBlockRange(true, true);
				for (let by = range.y1; by <= range.y2; ++by)
					for (var bx = range.x1; bx <= range.x2; ++bx)
						if (this.isBlockOccupied(bx, by)) {
							dirY += this.#slideEntityAroundRect(e, 0, dirY,
								bx * this.sprites.spriteWidth, by * this.sprites.spriteHeight,
								(bx + 1) * this.sprites.spriteWidth, (by + 1) * this.sprites.spriteHeight);
							}

				if (e.dirY - dirY)
						dirX /= Math.SQRT1_2;

				if (Math.abs(dirY - Math.round(dirY)) < 0.001)
						dirY = Math.round(dirY);

				e.y += dirY;
				let roundDiff = Math.abs(e.y - Math.round(e.y));
				if (roundDiff < 0.001)
						e.y = Math.round(e.y);
			}
		}

		e.dirX = dirX;
		e.dirY = dirY;
		e.lastAppliedDirX = e.dirX;
		e.lastAppliedDirY = e.dirY;
	}

	tick(delta) {
		this.#addOrRemoveEntities();

		this.entities.forEach(e => {
			e.tick(delta);
		});

		this.#addOrRemoveEntities();

		this.entities.forEach(e => this.#handleEntityMovement(e, delta));
	}

	/**
	 * @param {CanvasRenderingContext2D} ctx Target 2D context
	 */
	render(ctx, x, y) {
		this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);

		for (let y = 0; y < this.height; ++y) {
			for (let x = 0; x < this.width; ++x) {
				let block = this.blocks[x][y];
				let blockX = x * this.sprites.spriteWidth * this.scale;
				let blockY = y * this.sprites.spriteHeight * this.scale;

				if (typeof(block) == "number") {
					this.sprites.drawSpriteIndex(
						this.canvasContext,
						blockX, blockY,
						this.baseSpriteIndex + block, this.scale);
				}
				else if (block instanceof Array) {
					for (let i = 0; i < block.length; ++i) {
						this.sprites.drawSpriteIndex(
							this.canvasContext,
							blockX, blockY,
							this.baseSpriteIndex + block[i], this.scale);
					}
				}
			}
		}

		this.entities.forEach(e => {
			e.render(this.canvasContext, this.scale);

			if (this.debugDrawColliders) {
				this.canvasContext.strokeStyle = "red";
				for (let y = 0; y < this.height; ++y) {
					for (let x = 0; x < this.width; ++x) {
						if (this.colliders[x][y]) {
							this.canvasContext.strokeRect(
								Math.floor(x * this.sprites.spriteWidth * this.scale) + 0.5,
								Math.floor(y * this.sprites.spriteHeight * this.scale) + 0.5,
								Math.floor(this.sprites.spriteWidth * this.scale),
								Math.floor(this.sprites.spriteHeight * this.scale));

							this.canvasContext.beginPath();
							this.canvasContext.moveTo(
								x * this.sprites.spriteWidth * this.scale,
								y * this.sprites.spriteHeight * this.scale);

							this.canvasContext.lineTo(
								(x + 1) * this.sprites.spriteWidth * this.scale,
								(y + 1) * this.sprites.spriteHeight * this.scale);

							this.canvasContext.moveTo(
								(x + 1) * this.sprites.spriteWidth * this.scale,
								y * this.sprites.spriteHeight * this.scale);

							this.canvasContext.lineTo(
								x * this.sprites.spriteWidth * this.scale,
								(y + 1) * this.sprites.spriteHeight * this.scale);

							this.canvasContext.stroke();
						}
					}
				}
			}

			if (this.debugDrawBBoxes) {
				this.canvasContext.strokeStyle = "yellow";
				this.canvasContext.strokeRect(
					Math.floor(e.x * this.scale) + 0.5,
					Math.floor(e.y * this.scale) + 0.5,
					Math.floor(e.width * this.scale),
					Math.floor(e.height * this.scale));
			}
		});

		ctx.drawImage(
			this.canvas,
			Math.floor(x - this.cameraX * this.scale),
			Math.floor(y - this.cameraY * this.scale));
	}
}
