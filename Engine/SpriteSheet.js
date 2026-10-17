// SpriteSheet class
function SpriteSheet(name, spriteWidth, spriteHeight)
{
	this.IsLoaded = false;
	
	this.Image = new Image();

	var loaderInstance = this;
	this.Image.onload = function()
	{
		loaderInstance.SpriteCountX = Math.floor(loaderInstance.Image.width / loaderInstance.SpriteWidth);
		loaderInstance.SpriteCountY = Math.floor(loaderInstance.Image.height / loaderInstance.SpriteHeight);
		
		loaderInstance.IsLoaded = true;
	}
	
	if (name) this.Image.src = name;

	this.SpriteWidth = spriteWidth;
	this.SpriteHeight = spriteHeight;
	
	this.SpriteCountX = 0;
	this.SpriteCountY = 0;
	
	this.InnerOffsetX = 0;
	this.InnerOffsetY = 0;
	
	this.DrawSpriteByPos = function(context, x, y, spriteX, spriteY)
	{
		context.drawImage
		(
			this.Image,
			spriteX * this.SpriteWidth, spriteY * this.SpriteHeight, this.SpriteWidth, this.SpriteHeight,
			x - this.InnerOffsetX, y - this.InnerOffsetY, this.SpriteWidth, this.SpriteHeight
		);
	}

	this.DrawSpriteByIndex = function(context, x, y, index)
	{
		if (index < 0)
			return;
	
		this.DrawSpriteByPos(context, x, y, index % this.SpriteCountX, Math.floor(index / this.SpriteCountX));			
	}

	this.DrawSpriteScaled = function(context, x, y, index, scale)
	{
		if (index < 0)
			return;

		context.drawImage
		(
			this.Image,
			(index % this.SpriteCountX) * this.SpriteWidth, Math.floor(index / this.SpriteCountX) * this.SpriteHeight, this.SpriteWidth, this.SpriteHeight,
			x - this.InnerOffsetX * scale, y - this.InnerOffsetY * scale, this.SpriteWidth * scale, this.SpriteHeight * scale
		);
	}
}

// Wrap an already-drawn canvas as a sprite sheet (used for per-player recolours).
SpriteSheet.FromCanvas = function(canvas, spriteWidth, spriteHeight, innerX, innerY)
{
	var s = new SpriteSheet(null, spriteWidth, spriteHeight);

	s.Image = canvas;
	s.InnerOffsetX = innerX;
	s.InnerOffsetY = innerY;
	s.SpriteCountX = Math.floor(canvas.width / spriteWidth);
	s.SpriteCountY = Math.floor(canvas.height / spriteHeight);
	s.IsLoaded = true;

	return s;
}
