// Game world class prototype
function GameWorldPrototype()
{
	Engine.RegisterModule(this);
	
	this.Walls = [];
	this.WallSpriteOffset = 0;
	
	this.DangerLevel = [];

	this.WorldWidth = 0;
	this.WorldHeight = 0;

	this.BlockWidth = 0;
	this.BlockHeight = 0;
	
	this.X = 0;
	this.Y = 0;
	
	this.GroundStyle = 40;
	this.CacheImage = null;
	this.CacheContext = null;
	// The walls and bricks alone, drawn over the ground (and whatever lies on it, like fragments)
	this.WallImage = null;
	this.WallContext = null;
	
	this.PowerUpChance = 0.5;
	
	this.PlayerPosX = 0;
	this.PlayerPosY = 0;
	
	// Bumped whenever the walls change (LAN snapshots only resend walls when this changes)
	this.Version = 0;

	var isValid = false;
	
	this.Init = function()
	{
		this.CacheImage = document.createElement('canvas');
		this.CacheContext = this.CacheImage.getContext("2d");
		this.WallImage = document.createElement('canvas');
		this.WallContext = this.WallImage.getContext("2d");
	}
	
	this.RegenerateCacheImage = function()
	{
		if (Renderer.SpriteSheet == null || Renderer.SpriteSheet.IsLoaded == false)
		{
			isValid = false;
			return;
		}
	
		this.CacheImage.width = this.WorldWidth * this.BlockWidth;
		this.CacheImage.height = this.WorldHeight * this.BlockHeight;
		this.WallImage.width = this.CacheImage.width;
		this.WallImage.height = this.CacheImage.height;

		var ctx = this.CacheContext;
		var wctx = this.WallContext;

		for (var y = 0, by = 0; y < this.WorldHeight; ++y, by += this.BlockHeight)
		{
			for (var x = 0, bx = 0; x < this.WorldWidth; ++x, bx += this.BlockWidth)
			{
			    Renderer.SpriteSheet.DrawSpriteByIndex(ctx, bx, by, this.GroundStyle);
			    
			    if (y > 0 && this.Walls[y][x] == ' ' && this.Walls[y - 1][x] != ' ')
			    {
				    Renderer.SpriteSheet.DrawSpriteByIndex(ctx, bx, by, this.GroundStyle + 1);
				}
			
				var ch = "0123456789".indexOf(this.Walls[y][x]);
			
				if (ch >= 0)
                {
    				Renderer.SpriteSheet.DrawSpriteByIndex(wctx, bx, by, this.WallSpriteOffset + ch);
                }
                else
                {
                    switch (this.Walls[y][x])
                    {
                        case 'A':
                            Renderer.SpriteSheet.DrawSpriteByIndex(wctx, bx, by, 99);
                            break;

                        case 'B':
                            Renderer.SpriteSheet.DrawSpriteByIndex(wctx, bx, by, 119);
                            break;

                        case 'C':
                            Renderer.SpriteSheet.DrawSpriteByIndex(wctx, bx, by, 139);
                            break;

                        case 'D':
                            Renderer.SpriteSheet.DrawSpriteByIndex(wctx, bx, by, 159);
                            break;
                    }
                }
			}
		}

		isValid = true;
	}
	
	this.RemoveDotTags = function()
	{
		for (var y = 0; y < this.WorldHeight; ++y)
		{
			if (this.Walls[y].indexOf(".") >= 0)
			{
				this.Walls[y] = this.Walls[y].replace(".", " ");
				this.Invalidate();
			}
		}
	}
	
	this.Tick = function(delta)
	{
		this.RemoveDotTags();

		if (isValid == false)
		{
			this.RegenerateCacheImage();
		}		 
	}
	
	this.Invalidate = function()
	{
		++this.Version;
		isValid = false;
	}
	
	this.TestCollision = function(x1, y1, x2, y2)
	{
		x1 = Math.floor(x1 / this.BlockWidth);			
		y1 = Math.floor(y1 / this.BlockHeight);
		x2 = Math.floor(x2 / this.BlockWidth);			
		y2 = Math.floor(y2 / this.BlockHeight);
		
		if (x1 < 0) x1 = 0; else if (x1 >= this.WorldWidth) x1 = this.WorldWidth - 1;
		if (y1 < 0) y1 = 0; else if (y1 >= this.WorldHeight) y1 = this.WorldHeight - 1;
		if (x2 < 0) x2 = 0; else if (x2 >= this.WorldWidth) x2 = this.WorldWidth - 1;
		if (y2 < 0) y2 = 0; else if (y2 >= this.WorldHeight) y2 = this.WorldHeight - 1;
		
		for (var y = y1; y <= y2; ++y)
		{
			for (var x = x1; x <= x2; ++x)
			{
				if (this.Walls[y][x] != ' ')
					return true;
			}
		}
		
		return false;
	}
	
	this.GetBlock = function(x, y)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		if (x < 0 || x >= this.WorldWidth) return '0';
		if (y < 0 || y >= this.WorldHeight) return '0';
		
		return this.Walls[y][x];
	}
	
	this.GetBlockInDirection = function(x, y, dir)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		switch (dir)
		{
			case 1: --y; break;
			case 2: ++x; break;
			case 3: ++y; break;
			case 4: --x; break;
		}

		if (x < 0 || x >= this.WorldWidth) return 0;
		if (y < 0 || y >= this.WorldHeight) return 0;

		return this.Walls[y][x];		
	}
	
	this.SetBlock = function(x, y, block)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		if (x < 0 || x >= this.WorldWidth) return;
		if (y < 0 || y >= this.WorldHeight) return;
		
		this.Walls[y] = this.Walls[y].setCharAt(x, block);
		this.Invalidate();
	}
	
	this.SetBlockInDirection = function(x, y, dir, block)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		switch (dir)
		{
			case 1: --y; break;
			case 2: ++x; break;
			case 3: ++y; break;
			case 4: --x; break;
		}		
		
		if (x < 0 || x >= this.WorldWidth) return;
		if (y < 0 || y >= this.WorldHeight) return;
		
		this.Walls[y] = this.Walls[y].setCharAt(x, block);
		this.Invalidate();
	}
	
	this.GetDangerLevel = function(x, y)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		if (x < 0 || x >= this.WorldWidth) return 0;
		if (y < 0 || y >= this.WorldHeight) return 0;
		
		return this.DangerLevel[y][x];
	}
	
	this.GetDangerInDirection = function(x, y, dir)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		switch (dir)
		{
			case 1: --y; break;
			case 2: ++x; break;
			case 3: ++y; break;
			case 4: --x; break;
		}

		if (x < 0 || x >= this.WorldWidth) return 0;
		if (y < 0 || y >= this.WorldHeight) return 0;

		return this.DangerLevel[y][x];	
	}
	
	this.AddDangerLevel = function(x, y, add)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		if (x < 0 || x >= this.WorldWidth) return;
		if (y < 0 || y >= this.WorldHeight) return;
		
		var danger = this.DangerLevel[y][x] + add;
		
		if (danger < 0)
			danger = 0;
		
		this.DangerLevel[y][x] = danger;
	}
	
	this.AddDangerLine = function(x, y, dx, dy, len, add)
	{
		x = Math.floor(x / this.BlockWidth);			
		y = Math.floor(y / this.BlockHeight);
		
		for (var i = 0; i < len; ++i)
		{
			if (x < 0 || x >= this.WorldWidth) break;
			if (y < 0 || y >= this.WorldHeight) break;
			
			if (this.Walls[y][x] != ' ')
				break;
			
			var danger = this.DangerLevel[y][x] + add;
			
			if (danger < 0)
				danger = 0;
			
			this.DangerLevel[y][x] = danger;
			
			x += dx;
			y += dy;		
		}
	}

	this.AddDangerCross = function(x, y, len, add)
	{
		this.AddDangerLine(x, y, 0, -1, len, add);
		this.AddDangerLine(x, y, 0, 1, len, add);
		this.AddDangerLine(x, y, -1, 0, len, add);
		this.AddDangerLine(x, y, 1, 0, len, add);
	}
	
	this.GetAlignedX = function(x)
	{
		return Math.floor(x / GameWorld.BlockWidth) * GameWorld.BlockWidth;
	}

	this.GetAlignedY = function(y)
	{
		return Math.floor(y / GameWorld.BlockHeight) * GameWorld.BlockHeight;
	}
}

var GameWorld = new GameWorldPrototype();
