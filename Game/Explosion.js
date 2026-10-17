// Explosion entity
function Explosion()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "Explosion";
	this.Solid = false;
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [0, 1, 2, 3];
	this.Sprite.AnimationSpeed = 5.0;
	this.Sprite.Loop = false;
	
	// 0 = center, 1 = vertical, 2 = horizontal
	this.TailOrientation = 0;
	
	// True when this is the ending of explosion tail
	this.IsTail = false;
	
	this.Tick = function(delta)
	{
		if (this.Sprite.IsFinished())
		{
			this.Health = 0.0;
		}
	}
	
	this.OnTouch = function(entity, overlapFactor)
	{
		if (entity.Type == "Explosion" && this.Health > 0 && overlapFactor > 0.1)
		{
		
			if (entity.Time < this.Time || (entity.Time == this.Time && entity.ID < this.ID))
			{
				if (this.TailOrientation == 0 || (this.TailOrientation + entity.TailOrientation == 3))
				{
					entity.Sprite.Frames = [140, 141, 142, 143];
				}
				else if (this.IsTail == false && entity.IsTail == true)
				{
					entity.Sprite.Frames = this.Sprite.Frames;
				}
			
				this.Health = 0.0;
			}
		}
	}
}

Explosion.prototype = new GameEntity;

function GeneratePowerUp(x, y, owner)
{
	var pl = PlayerManager.Neediest();

	if (pl == null)
		return;

	if (Math.random() < 0.5)
	{
		var type = -1;

		// Chance for common power-up
		if (Math.random() < 0.5)
		{
			if (Math.random() < Math.pow((1.0 / pl.TotalBombs) * (1.0 / pl.Power), 0.25))
			{
				var bombsProb = Math.random() * (1.0 / pl.TotalBombs);
				var powerProb = Math.random() * (1.0 / pl.Power);

				if (bombsProb > powerProb)
					type = 1;
				else
					type = 0;
			}
			else
				type = 2 + Math.floor(Math.random() * 2.0);

			if (pl.TotalBombs >= 5 && pl.Power >= 5 && Math.random() < 0.1)
			{
				type = 7;
			}
		}
		else
		{
			if (pl.Hearts < 3 && Math.random() < 0.25)
			{
				type = 4;
			}
			else if (Math.random() < 0.25)
			{
				type = 5;

				if (Math.random() < 0.2 / (pl.Lifes + 1))
					type = 6;
			}
		}

		// Battle is one-hit kills: no hearts, no extra lives
		if (type >= 0 && Engine.Application && Engine.Application.Mode == "battle" && !BattlePowerUpAllowed(type))
			type = -1;

		if (type >= 0)
		{
			var pu = new PowerUp();

			pu.X = x;
			pu.Y = y;

			pu.SetPowerUpType(type);

			// Campaign: what a human's bomb uncovers stays out of the CPU players' reach for a while
			var app = Engine.Application, who = ExplosionOwnerIndex({ Type: "Explosion", Owner: owner });

			if (who >= 0 && app && app.Mode == "campaign" && !(app.Roster[who] && app.Roster[who].Bot))
				pu.BotLock = POWERUP_BOT_LOCK;
		}
	}
}

function CreateExplosionLine(owner, ex, ey, dir, len, stopOnWalls)
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
	
	var ax = GameWorld.GetAlignedX(ex + GameWorld.BlockWidth / 2);
	var ay = GameWorld.GetAlignedY(ey + GameWorld.BlockHeight / 2);
	
	for (var i = 0; i < len; ++i)
	{
		var x = ax + dx * (i + 0) * GameWorld.BlockWidth;
		var y = ay + dy * (i + 0) * GameWorld.BlockHeight;
		
		var tail = (i == len - 1);

		var block = GameWorld.GetBlock(x + GameWorld.BlockWidth / 2, y + GameWorld.BlockHeight / 2);

		if (block != ' ')
		{
			if (block == '1')
			{
				var hw = new HotWall();

				hw.X = x;
				hw.Y = y;

				GameWorld.SetBlock(x + GameWorld.BlockWidth / 2, y + GameWorld.BlockHeight / 2, '.');
				GeneratePowerUp(x, y, owner);

				tail = true && stopOnWalls;
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
		exp.Owner = owner;

		// the flames burn in the colour of the player whose bomb it was
		var pi = ExplosionOwnerIndex({ Type: "Explosion", Owner: owner });

		if (pi >= 0)
			exp.Sprite.Sheet = Tint.GetFlameSheet(pi % PLAYER_FLAME_COLORS.length);
		exp.IsTail = tail;

		if (dx != 0)
			exp.TailOrientation = 1;

		if (dy != 0)
			exp.TailOrientation = 2;

		if (tail)
			break;
	}
}

function CreateExplosionCross(owner, ex, ey, len, stopOnWalls)
{
	++len;

	CreateExplosionLine(owner, ex, ey, 1, len, stopOnWalls);
	CreateExplosionLine(owner, ex, ey, 2, len, stopOnWalls);
	CreateExplosionLine(owner, ex, ey, 3, len, stopOnWalls);
	CreateExplosionLine(owner, ex, ey, 4, len, stopOnWalls);
}
