class SpriteSheet {
	image = new Image();
	spriteWidth = 0;
	spriteHeight = 0;
	cellWidth = 0;
	cellHeight = 0;
	numCellsX = 0;
	numCellsY = 0;
	chars = "";
	offsetX = 0;
	offsetY = 0;

	/** @type {SpriteSheet} */
	glyphs = null;

	/**
	 * @param {string} src URL with font bitmap
	 * @param {number} spriteWidth Sprite width in pixels
	 * @param {number} spriteHeight Sprite height in pixels
	 * @param {string} chars Characters in bitmap
	 */
	constructor(src, spriteWidth, spriteHeight, cellWidth = 0, cellHeight = 0) {
		this.spriteWidth = spriteWidth;
		this.spriteHeight = spriteHeight;
		this.cellWidth = cellWidth ? cellWidth : spriteWidth;
		this.cellHeight = cellHeight ? cellHeight : spriteHeight;
		this.offsetX = -Math.floor((this.cellWidth - this.spriteWidth) / 2);
		this.offsetY = -Math.floor((this.cellHeight - this.spriteHeight) / 2);
		
		this.image.onload = () => {
			this.numCellsX = Math.floor(this.image.width / this.cellWidth);
			this.numCellsY = Math.floor(this.image.height / this.cellHeight);
		};

		this.image.src = src;
	}

	drawSprite(ctx, x, y, spriteX, spriteY, scale = 1.0) {
		if (!this.image || !this.image.complete)
			return;

		ctx.drawImage(
			this.image,
			spriteX * this.cellWidth, spriteY * this.cellHeight, this.cellWidth, this.cellHeight,
			x + this.offsetX * scale, y + this.offsetY * scale, this.cellWidth * scale, this.cellHeight * scale)
	}

	drawSpriteIndex(ctx, x, y, spriteIndex, scale = 1.0) {
		if (!this.image || !this.image.complete || !this.numCellsX || spriteIndex < 0)
			return;

		let spriteX = spriteIndex % this.numCellsX;
		let spriteY = Math.floor(spriteIndex / this.numCellsX);
		this.drawSprite(ctx, x, y, spriteX, spriteY, scale);
	}

	/**
	 * @param {string} text 
	 */
	measureText(text) {
		let result = { width: 0, height: 0 };

		for (var i = 0, x = 0, y = 0; i < text.length; ++i) {
			let ch = text.charAt(i);

			if (ch == '\n') {
				x = 0;
				y += this.spriteHeight;
				continue;
			}

			if (x + this.spriteWidth > result.width)
				result.width = x + this.spriteWidth;

			if (y + this.spriteHeight > result.height)
				result.height = y + this.spriteHeight;

			x += this.spriteWidth;
		}

		return result;
	}

	/**
	 * @param {CanvasRenderingContext2D} ctx Destination 2D context
	 * @param {number} x X position
	 * @param {number} y Y position
	 * @param {string} text Text to print
	 */
	print(ctx, x, y, text, scale = 1.0) {
		if (!this.image || !this.image.complete)
			return;

		let prevImageSmoothingEnabled = ctx.imageSmoothingEnabled;
		ctx.imageSmoothingEnabled = false;

		let lineStartX = x + this.offsetX;
		y += this.offsetY;

		for (var i = 0; i < text.length; ++i) {
			let ch = text.charAt(i);

			if (ch == ' ') {
				x += this.spriteWidth * scale;
				continue;
			}
			else if (ch == '\n') {
				x = lineStartX * scale;
				y += this.spriteHeight * scale;
				continue;
			}
			else if (ch == '{') {
				let glyphMarkEnd = text.indexOf("}", i + 1);
				if (glyphMarkEnd < 0)
					return;

				let glyphText = text.substring(i + 1, glyphMarkEnd);
				text = text.substr(0, i) + text.substr(glyphMarkEnd);

				if (this.glyphs) {
					let glyphX = 0;
					let glyphY = 0;
					let semicolonPos = glyphText.indexOf(";");
					if (semicolonPos > 0) {
						glyphX = parseInt(glyphText.substr(0, semicolonPos));
						glyphY = parseInt(glyphText.substr(semicolonPos + 1));
					}
					else {
						let glyphIndex = parseInt(glyphText);
						// TODO
					}

					let yOffset = (this.spriteHeight - this.glyphs.spriteHeight) / 2;

					this.glyphs.drawSprite(ctx, x, y + yOffset * scale, glyphX, glyphY, scale);
					x += this.glyphs.spriteWidth * scale;
				}

				continue;
			}

			let chIndex = this.chars.indexOf(ch);
			if (chIndex >= 0) {
				let glyphX = (chIndex % this.numCellsX) * this.spriteWidth;
				let glyphY = Math.floor(chIndex / this.numCellsX) * this.spriteHeight;

				ctx.drawImage(
					this.image,
					glyphX, glyphY, this.spriteWidth, this.spriteHeight,
					x, y, this.spriteWidth * scale, this.spriteHeight * scale);
			}
			
			x += this.spriteWidth * scale;
		}

		ctx.imageSmoothingEnabled = prevImageSmoothingEnabled;
	}

	/**
	 * @param {CanvasRenderingContext2D} ctx 
	 * @param {number} x 
	 * @param {number} y 
	 * @param {string} text 
	 * @param {number} scale 
	 */
	printShadowed(ctx, x, y, text, scale = 1.0) {
		let prevFilter = ctx.filter;
		ctx.filter = "brightness(0) opacity(0.5)";
		this.print(ctx, x + scale, y + scale, text, scale);
		ctx.filter = prevFilter;
		this.print(ctx, x, y, text, scale);
	}
}
