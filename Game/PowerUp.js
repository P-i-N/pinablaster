// The skull (bad luck) power-up does not last: it blinks after SKULL_BLINK_AFTER seconds and
// SKULL_FUSE seconds later it blows up (reach 1-5) or breaks open and lets out a random enemy.
var SKULL_TYPE = 5;
var SKULL_BLINK_AFTER = 10.0;
var SKULL_FUSE = 5.0;

// Seconds a power-up uncovered by a human player's bomb (campaign) is left alone by the CPU players
var POWERUP_BOT_LOCK = 10.0;

// Power-up entity, yay!
function PowerUp()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "PowerUp";
	this.Solid = false;
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [0];
	this.Sprite.AnimationSpeed = 10.0;
	this.Sprite.Loop = true;
	
	this.Layer = -2;
	
	this.PowerUpType = 0; 

	// Real seconds alive (Time runs at double speed)
	this.Age = 0.0;

	// Seconds left in which CPU players keep away from it (the human who bombed it free gets first pick)
	this.BotLock = 0.0;
	
	this.SetPowerUpType = function(type)
	{
		this.PowerUpType = type;

        switch (type)
        {
            default:
	            this.Sprite.IndexOffset = 160;
                this.Sprite.Frames = [type];
                break;

            case 7:
            	this.Sprite.IndexOffset = 0;
                this.Sprite.Frames = [97];
                break;
        }
	}
	
	this.Tick = function(delta)
	{
		this.Age += delta;

		if (this.BotLock > 0.0)
			this.BotLock = Math.max(0.0, this.BotLock - delta);

		if (this.PowerUpType != SKULL_TYPE || this.Age < SKULL_BLINK_AFTER)
			return;

		// quick blinking, then the end
		this.Sprite.Alpha = Math.floor(this.Age * 12.0) % 2 == 0 ? 1.0 : 0.2;

		if (this.Age >= SKULL_BLINK_AFTER + SKULL_FUSE && this.Health > 0.0)
			this.SkullEnds();
	}

	this.SkullEnds = function()
	{
		this.Health = 0.0;
		this.Sprite.Alpha = 1.0;

		if (Math.random() < 0.5)
		{
			CreateExplosionCross({ Type: "Skull" }, this.X, this.Y, 1 + Math.floor(Math.random() * 5.0), true);
			Engine.PlaySound("audioExplosion" + Math.floor(1 + Math.random() * 5.0).toString());
		}
		else
		{
			var enemy = new Enemy();

			enemy.X = this.X;
			enemy.Y = this.Y;
			// (only the kinds the level started with)
			enemy.SetEnemyType(SkullEnemyType(Engine.Application ? Engine.Application.LevelEnemyTypes : null, Math.random));

			Engine.PlaySound("audioIcebreak" + Math.floor(1 + Math.random() * 4.0).toString());
		}
	}

	// A random power-up where this one is (never a skull; in a battle never a heart or an extra life). The blast that got us
	// is still burning here: the new one cannot be burnt by it (Time runs at double speed).
	this.TurnIntoPowerUp = function()
	{
		var types = [0, 1, 2, 3, 4, 6, 7].filter(function(t)
		{
			return !(Engine.Application && Engine.Application.Mode == "battle" && !BattlePowerUpAllowed(t));
		});

		var pu = new PowerUp();

		pu.X = this.X;
		pu.Y = this.Y;
		pu.SetPowerUpType(types[Math.floor(Math.random() * types.length)]);
		pu.Time = -2.0;
	}

	this.OnTouch = function(entity, overlapFactor)
	{
		if (this.Time > 0.5 && entity.Type == "Explosion" && overlapFactor > 0.5)
		{
			// A blinking skull blown up before its time is up turns into some other power-up
			if (this.Health > 0.0 && this.PowerUpType == SKULL_TYPE && this.Age >= SKULL_BLINK_AFTER)
				this.TurnIntoPowerUp();

			this.Health = 0.0;
		}
	}
}

PowerUp.prototype = new GameEntity();
