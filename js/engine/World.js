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

	testCollision(x, y, width, height) {
		let x1 = Math.floor(x / this.sprites.spriteWidth);
		let y1 = Math.floor(y / this.sprites.spriteHeight);
		let x2 = Math.floor((x + width) / this.sprites.spriteWidth);
		let y2 = Math.floor((y + height) / this.sprites.spriteHeight);
		
		if (x1 < 0) x1 = 0; else if (x1 >= this.width) x1 = this.width - 1;
		if (y1 < 0) y1 = 0; else if (y1 >= this.height) y1 = this.height - 1;
		if (x2 < 0) x2 = 0; else if (x2 >= this.width) x2 = this.width - 1;
		if (y2 < 0) y2 = 0; else if (y2 >= this.height) y2 = this.height - 1;

		for (let by = y1; by <= y2; ++by)
			for (var bx = x1; bx <= x2; ++bx)
				if (this.isBlockOccupied(bx, by))
					return true;
		
		return false;
	}

	/**
	 * @param {Entity} e 
	 * @param {number} delta 
	 */
	#handleEntityMovement(e, delta) {
		let newDirX = e.dirX;
		let newDirY = e.dirY;

		const sw = this.sprites.spriteWidth;
		const sh = this.sprites.spriteHeight;

		// Moving right
		if (newDirX > 0) {
			if (this.isBlockOccupied(
				Math.floor(((e.x + sw - 1) + newDirX) / sw),
				Math.floor(e.y / sh))) {
				e.x = Math.floor(e.x / sw) * sw;
				newDirX = 0;
			}

			if (this.isBlockOccupied(
				Math.floor(((e.x + sw - 1) + newDirX) / sw),
				Math.floor((e.y + sh - 1) / sh))) {
				e.x = Math.floor(e.x / sw) * sw;
				newDirX = 0;
			}
		}

		// Moving left
		if (newDirX < 0) {
			if (this.isBlockOccupied(
				Math.floor((e.x + newDirX) / sw),
				Math.floor(e.y / sh))) {
				e.x = Math.floor((e.x + sw - 1) / sw) * sw;
				newDirX = 0;
			}

			if (this.isBlockOccupied(
				Math.floor((e.x + newDirX) / sw),
				Math.floor((e.y + sh - 1) / sh))) {
				e.x = Math.floor((e.x + sw - 1) / sw) * sw;
				newDirX = 0;
			}
		}

		// Moving up
		if (newDirY < 0) {
			if (this.isBlockOccupied(
				Math.floor(e.x / sw),
				Math.floor((e.y + newDirY) / sh))) {
				e.y = Math.floor((e.y + sh - 1) / sh) * sh;
				newDirY = 0;
			}

			if (this.isBlockOccupied(
				Math.floor((e.x + sw - 1) / sw),
				Math.floor((e.y + newDirY) / sh))) {
				e.y = Math.floor((e.y + sh - 1) / sh) * sh;
				newDirY = 0;
			}
		}

		// Moving down
		if (newDirY > 0) {
			if (this.isBlockOccupied(
				Math.floor(e.x / sw),
				Math.floor(((e.y + sh - 1) + newDirY) / sh))) {
				e.y = Math.floor(e.y / sh) * sh;
				newDirY = 0;
			}

			if (this.isBlockOccupied(
				Math.floor((e.x + sw - 1) / sw),
				Math.floor(((e.y + sh - 1) + newDirY) / sh))) {
				e.y = Math.floor(e.y / sh) * sh;
				newDirY = 0;
			}
		}

		if (this.testCollision(e.x + newDirX, e.y + newDirY, e.width, e.height)) {
		}

		e.x += newDirX;
		e.y += newDirY;
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
