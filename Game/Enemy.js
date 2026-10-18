// Seconds a Shoop-da-whoop charges before its laser fires (it fires with 0.5 s of the charge left: the AI reads that too)
var SHOOP_CHARGE_SECONDS = 1.0;

// Seconds after a blast has broken an enemy's shield during which that same blast cannot kill it
var SHIELD_GRACE_SECONDS = 0.5;

// Enemy class
function Enemy()
{
	GameEntityManager.RegisterEntity(this);

	this.Type = "Enemy";
	
	this.Sprite = new Sprite();
	this.Sprite.Loop = true;
	this.Sprite.Frames = [0, 1, 2, 1];

	// Extend touch border!
	this.TouchBorder = 1;
	
	this.Solid = true;
	
	var lastX = -1, lastY = -1, lastDir = 0;
	var lastRealX = -1, lastRealY = -1, notmovedCount = 0;
    	
	// Enemy type
	this.EnemyType = 0;
	
	// Can enemy steal your powerups?
	this.Thief = false;
	
	// Does enemy fear bombs?
	this.FearOfBombs = false;
	
	// Does enemy fear player?
	this.FearOfPlayer = false;
	
	// Does enemy seek player?
	this.SeekPlayer = false;
	
	// Shoop da whoop!
	this.ShoopDaWhoop = false;
	
	// Firing meh lazer!
	this.ShoopTimer = 0.0;
	
	// Cover builder
	this.BuildCovers = false;
    
    // Spits fire
    this.SpitsFire = false;
    
    // Shielding
    this.Shielding = false;
    
    var shieldTimer = 0.0;
    var shieldGrace = 0.0;   // a shield broken by a blast: the rest of that blast does not kill
    var fearTimer = 0.0;
    var spitTimer = 0.0;
	var shoopDir = 0;

	this.SetEnemyType = function(type)
	{
		this.EnemyType = type;
		this.Sprite.IndexOffset = 67 + 20 * type;
		
		switch (type)
		{
			// Dumballoon
			case 0:
				this.Speed = 0.25;
				break;

			// Mop on meth
			case 1:
				this.Speed = 0.5;
				this.SeekPlayer = true;
				break;

			// Shoop-da-whoop
			case 2:
				this.Speed = 0.5;
				this.FearOfBombs = true;
				this.SeekPlayer = true;
				this.ShoopDaWhoop = true;
				break;

			// Drakentus
			case 3:
				this.Speed = 1.0;
				this.Thief = true;
				this.FearOfPlayer = true;
				break;

			// Flamie
			case 4:
				this.Speed = 0.5;
				this.Thief = true;
				this.FearOfPlayer = true;
                this.SpitsFire = true;
				break;

			// Blowfrog
			case 5:
				this.Speed = 1.0;
				this.FearOfPlayer = true;
				this.BuildCovers = true;
				break;

			// Angry 4channer
			case 6:
				this.Speed = 1.0;
				this.Thief = true;
				this.FearOfBombs = true;
				this.SeekPlayer = true;
                this.Shielding = true;
				break;
		}
	}
	
	this.OnTouch = function(entity, overlapFactor)
	{
		if (this.Thief == true && entity.Type == "PowerUp" && overlapFactor > 0.5)
		{
			entity.Health = 0.0;
		}
		else if (entity.Type == "Explosion" && overlapFactor > 0.25)
		{
			if (entity.Owner.Type == "Enemy")
			{
			
			}
			else
			{
                // A hit breaks the shield (and the rest of that blast, still burning on the tile, does no more harm)
                if (this.Shielding && shieldTimer > 0.0)
                {
                    shieldTimer = 0.0;
                    shieldGrace = SHIELD_GRACE_SECONDS;
                    this.Unshield();
                    return;
                }

                if (shieldGrace > 0.0)
                    return;
                                
				this.Health = 0.0;
				
				var dead = new DeadEnemy();
				dead.X = this.X;
				dead.Y = this.Y;
				
				switch (this.EnemyType)
				{
					case 0:
						dead.Sprite.Frames = [70, 71, 184, 185, 186];
						break;
						
					case 1:
					case 2:
					case 3:
					case 4:
					case 5:
					case 6:
						dead.Sprite.Frames = [70 + this.EnemyType * 20, 71 + this.EnemyType * 20, 72 + this.EnemyType * 20, 73 + this.EnemyType * 20, 184, 185, 186];
						break;
				}
				
				Engine.PlaySound("audioPoop");
			}
		}
        else if (entity.Type == "Player")
        {
            fearTimer = 5.0;
            
            switch (this.Direction)
            {
                case 1: this.Direction = 3; break;
                case 2: this.Direction = 4; break;
                case 3: this.Direction = 1; break;
                case 4: this.Direction = 2; break;
            }
            
            this.NextDirection = this.Direction;
        }
        else if (this.FearOfBombs && entity.Type == "Bomb")
        {
            fearTimer = 5.0;
            
            switch (this.Direction)
            {
                case 1: this.Direction = 3; break;
                case 2: this.Direction = 4; break;
                case 3: this.Direction = 1; break;
                case 4: this.Direction = 2; break;
            }
            
            this.NextDirection = this.Direction;
            
            if (this.Shielding)
                this.Shield();        
        }
	}
    
	this.OnExtendedTouch = function(entity, overlapFactor)
	{
		this.OnTouch(entity, overlapFactor);
	}    
	
	this.Tick = function(delta)
	{
		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
		var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);
		
		var dx = this.X % GameWorld.BlockWidth;
		var dy = this.Y % GameWorld.BlockHeight;
        
        if (shieldGrace > 0.0)
            shieldGrace -= delta;

        if (shieldTimer > 0.0)
        {
            shieldTimer -= delta;
            
            if (shieldTimer < 0.0)
            {
                shieldTimer = 0.0;
                this.Unshield();
            }
        }

        if (fearTimer > 0.0)
        {
            fearTimer -= delta;
            
            if (fearTimer < 0.0)
                fearTimer = 0.0;
        }

		if (notmovedCount > 2 * GameWorld.BlockWidth / this.Speed)
		{
			lastX = -1;
			lastY = -1;
			lastDir = this.Direction;
			this.Direction = 0;
			this.NextDirection = 0;
			
			notmovedCount = 0;
		}

		// What we didn't move at all?
		if (this.X == lastRealX && this.Y == lastRealY)
			++notmovedCount;
		
		// We moved to another world block! Great! What should we do now?
		if ((ax != lastX || ay != lastY) && this.ShoopTimer <= 0.0)
		{
			ax = GameWorld.GetAlignedX(this.X);
			ay = GameWorld.GetAlignedY(this.Y);

			notmovedCount = 0;
			
			var target = PlayerManager.Nearest(this.X, this.Y);

			if (target && (this.FearOfPlayer || fearTimer > 0.0))
			{
				var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
				var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);

				if (this.Direction != 1 && py < ay && ax == px && dx == 0) this.NextDirection = 3;
				else if (this.Direction != 2 && px > ax && ay == py && dy == 0) this.NextDirection = 4;
				else if (this.Direction != 3 && py > ay && ax == px && dx == 0) this.NextDirection = 1;
				else if (this.Direction != 4 && px < ax && ay == py && dy == 0) this.NextDirection = 2;
			}
			else if (target && this.SeekPlayer)
			{
				var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
				var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);

				if (this.Direction != 1 && py < ay && ax == px && dx == 0) this.NextDirection = 1;
				else if (this.Direction != 2 && px > ax && ay == py && dy == 0) this.NextDirection = 2;
				else if (this.Direction != 3 && py > ay && ax == px && dx == 0) this.NextDirection = 3;
				else if (this.Direction != 4 && px < ax && ay == py && dy == 0) this.NextDirection = 4;
			}
            
            if (this.SpitsFire)
            {
                spitTimer -= delta;
                if (spitTimer < 0.0)
                {
                    spitTimer = 0.0;

                    var dir = this.GetPlayerSightDirection();
                    
                    if (dir > 0)
                    {
                        var shot = new Shot();
                        
                        shot.X = this.X;
                        shot.Y = this.Y;
                        shot.Owner = this;
                        shot.AlignToWorldGrid();
                        shot.Direction = dir;
                        
                        spitTimer = 1.0;

                        Engine.PlaySound("audioShot");
                    }
                }
            }
            
            if (this.Shielding && Math.random() < 0.005 && shieldTimer <= 0.0)
            {
                this.Shield();
            }

			if (this.ShoopDaWhoop && Math.random() < 0.2 && fearTimer <= 0.0)
			{
				var dir = this.GetPlayerSightDirection();

				if (dir > 0 && dir == this.Direction)
				{
					if (((dir == 1 || dir == 3) && dx == 0) || ((dir == 2 || dir == 4) && dy == 0))
					{
						Engine.PlaySound("audioShoopDaWhoop");
						shoopDir = dir;
						this.ShoopDir = dir;   // read by the AI (AiBuildView)
						
						this.ShoopTimer = SHOOP_CHARGE_SECONDS;
						this.Direction = 0;
						this.NextDirection = 0;
						this.Sprite.Frames = [2, 1, 2, 0, 0, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 1, 0, 0, 1, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 2];
						this.Sprite.Loop = false;
						this.Sprite.AnimationSpeed = 1.0 / SHOOP_CHARGE_SECONDS;   // (the wind-up animation lasts the whole charge)
					}
				}
			}
			
			if (this.BuildCovers && this.Direction > 0)
			{
				for (var i = 1; i < 5; ++i)
				{
					var danger = GameWorld.GetDangerInDirection(ax, ay, i);
					
					if (danger > 0 && GameWorld.GetBlockInDirection(ax, ay, i) == ' ')
					{
						var nx = ax, ny = ay;
						
						switch (i)
						{
							case 1: ny -= GameWorld.BlockHeight; break;
							case 2: nx += GameWorld.BlockWidth; break;
							case 3: ny += GameWorld.BlockHeight; break;
							case 4: nx -= GameWorld.BlockWidth; break;
						}
					
						if (GameEntityManager.IsEntityFreeSpotThere(this, nx, ny, nx + GameWorld.BlockWidth - 1, ny + GameWorld.BlockHeight - 1))
						{
							if (!BoxIntersection(this.X, this.Y, this.X + this.Width - 1, this.Y + this.Height - 1, nx, ny, nx + GameWorld.BlockWidth - 1, ny + GameWorld.BlockHeight - 1))
							{
								GameEntityManager.SendMessage(this, "remove_danger_level");
								GameWorld.SetBlock(nx, ny, '1');
								GameEntityManager.SendMessage(this, "add_danger_level");
								
								this.Direction = 0;
								this.NextDirection = 0;
							}
						}				
					}
				}
			}
			
			if (this.Direction == 0)
			{
				this.GenerateDirection();
			}
		
			if (this.NextDirection == 0 && this.Direction == 0)
			{
				this.GenerateNextDirection();
			}			
				
			lastX = ax;
			lastY = ay;		
		}
		else
		{
			++notmovedCount;
		
			if (this.ShoopTimer > 0.0)
			{
			    this.ShoopTimer -= delta;
			    
			    if (this.ShoopTimer <= 0.5 && this.ShoopTimer + delta > 0.5)
			    {
			    	Engine.PlaySound("audioExplosion" + Math.floor(1 + Math.random() * 5.0).toString());
			    	this.FireMyLazer(shoopDir);
				}
			    else if (this.ShoopTimer <= 0.0)
			    {
					this.Sprite.Frames = [0, 1, 2, 1];
					this.Sprite.Loop = true;
					this.Sprite.AnimationSpeed = 2.5;

					this.GenerateDirection();
					this.GenerateNextDirection();
				}
			}
		}

		lastRealX = this.X;
		lastRealY = this.Y;
	}
	
	this.OnDirectionChange = function()
	{
	    if (this.ShoopTimer > 0.0)
	        return;
	
		if (this.Direction == 0)
		{
			this.GenerateDirection();
		}
	}
	
	this.GenerateNextDirection = function()
	{
		var again = false;
		var tries = 0;
		
		do
		{
			again = false;
			this.NextDirection = 1 + Math.floor(Math.random() * 4.0);
			
			if (this.Direction == 1 && this.NextDirection == 3) again = true;
			if (this.Direction == 2 && this.NextDirection == 4) again = true;
			if (this.Direction == 3 && this.NextDirection == 1) again = true;
			if (this.Direction == 4 && this.NextDirection == 2) again = true;
			
			if (this.FearOfBombs && GameWorld.GetDangerInDirection(this.X, this.Y, this.NextDirection) > 0)
			{
				again = true;
				++tries;
			}
			
		} while (again && tries < 10);
	}
	
	this.GenerateDirection = function()
	{
		var again = false;
		var tries = 0;
	
		lastDir = this.Direction;	
	
		do
		{	
			again = false;
			var alternative = 0;
			
			if (lastDir == 0)
				this.Direction = 1 + Math.floor(Math.random() * 4.0);
			else
			{
				switch (lastDir)
				{
					case 1:
					case 3:
						this.Direction = 2 + Math.floor(Math.random() * 2.0) * 2;
						alternative = this.Direction == 2 ? 4 : 2;
						break;

					case 2:
					case 4:
						this.Direction = 1 + Math.floor(Math.random() * 2.0) * 2;
						alternative = this.Direction == 1 ? 3 : 1;
						break;
				}
			}
			
			if (this.FearOfBombs && GameWorld.GetDangerInDirection(this.X, this.Y, this.Direction) > 0)
			{
				if ((alternative && GameWorld.GetDangerInDirection(this.X, this.Y, alternative) > 0) || !alternative)
				{
					again = true;
					++tries;
				}
				else
				{
					this.Direction = alternative;
				}
			}
			
		} while (again && tries < 10);
		
		var target = PlayerManager.Nearest(this.X, this.Y);

		if (this.SeekPlayer && target)
		{
			var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
			var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);

			var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
			var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);

			if (this.Direction != 1 && py < ay && ax == px) this.Direction = 1;
			if (this.Direction != 2 && px > ax && ay == py) this.Direction = 2;
			if (this.Direction != 3 && py > ay && ax == px) this.Direction = 3;
			if (this.Direction != 4 && px < ax && ay == py) this.Direction = 4;
		}
	}
	
	this.GetPlayerSightDirection = function()
	{
		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
		var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);

		var target = PlayerManager.Nearest(this.X, this.Y);

		if (!target)
			return 0;

		var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
		var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);
		
		// Player is not aligned in any usefull direction
		if (ax != px && ay != py)
		    return 0;
		
		var dx = 0, dy = 0;
		
		if (ax < px) dx = 1; else if (ax > px) dx = -1;
		if (ay < py) dy = 1; else if (ay > py) dy = -1;

		ax += dx;
		ay += dy;

		var mx = GameWorld.WorldWidth * GameWorld.BlockWidth;
		var my = GameWorld.WorldHeight * GameWorld.BlockHeight;
		
		while (ax > 0 && ay > 0 && ax < mx && ay < my)
		{
		    if (ax == px && ay == py)
		        break;
		        
			if (GameWorld.GetBlock(ax, ay) != ' ')
			    return 0;

			ax += dx;
			ay += dy;
		}
		
		if (dy < 0) return 1;
		if (dx > 0) return 2;
		if (dy > 0) return 3;
		if (dx < 0) return 4;
		
		return 0;
	}
    
    this.Shield = function()
    {
        if (shieldTimer <= 0.0 && shieldGrace <= 0.0)
        {
            shieldTimer = 5.0 + Math.random() * 5.0;
            this.Sprite.Alpha = 0.25;
            Engine.PlaySound("audioShield");
        }    
    }
    
    this.Unshield = function()
    {
        this.Sprite.Alpha = 1.0;
        Engine.PlaySound("audioShield");
    }
	
	this.FireMyLazer = function(dir)
	{
	    var tailBegin = [];
	    var tailEnd = [];
	    var tailLine = [];
	
		var dx = 0, dy = 0;
		switch (dir)
		{
			case 1:
			    tailBegin = [120, 121, 122, 123];
			    tailEnd = [80, 81, 82, 83];
			    tailLine = [100, 101, 102, 103];
				dy = -1;
				break;
				
			case 2:
			    tailBegin = [84, 104, 124, 144];
			    tailEnd = [86, 106, 126, 146];
			    tailLine = [85, 105, 125, 145];
				dx = 1;
				break;
				
			case 3:
			    tailBegin = [80, 81, 82, 83];
			    tailEnd = [120, 121, 122, 123];
			    tailLine = [100, 101, 102, 103];
				dy = 1;
				break;
				
			case 4:
			    tailBegin = [86, 106, 126, 146];
			    tailEnd = [84, 104, 124, 144];
			    tailLine = [85, 105, 125, 145];
				dx = -1;
				break;
			
		}
		
		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
		var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);
		var flames = [];
		
		for (var i = 0; i < GameWorld.WorldWidth; ++i)
		{
			var x = ax + dx * (i + 1) * this.Width;
			var y = ay + dy * (i + 1) * this.Height;
			
			var tail = false;

			var block = GameWorld.GetBlock(x + this.Width / 2, y + this.Height / 2);

			if (block != ' ')
			{
				if (block == '1')
				{
					var hw = new HotWall();

					hw.X = x;
					hw.Y = y;

					GameWorld.SetBlock(x + this.Width / 2, y + this.Height / 2, '.');
					GeneratePowerUp(x, y);
					tail = true;
				}
				else
					break;
			}

			exp = new Explosion();
			
			if (i == 0)
				exp.Sprite.Frames = tailBegin;
			else if (tail)
				exp.Sprite.Frames = tailEnd;
			else
			    exp.Sprite.Frames = tailLine;
				
			exp.X = x;
			exp.Y = y;
			exp.Owner = this;
			exp.IsTail = tail;
			flames.push([Math.floor(x / GameWorld.BlockWidth), Math.floor(y / GameWorld.BlockHeight)]);

			if (dx != 0)
				exp.TailOrientation = 1;

			if (dy != 0)
				exp.TailOrientation = 2;

			if (tail)
				break;
		}

		CrackBricksAround(flames);
	}
}

Enemy.prototype = new GameEntity();
