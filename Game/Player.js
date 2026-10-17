// Player class
// Pixels a player may overshoot an opening and still turn into it (a tile is 17 px, a player walks 1 px per 10 ms: about 60 ms)
var PLAYER_TURN_ASSIST = 6;

function Player()
{
	GameEntityManager.RegisterEntity(this);
	PlayerManager.Register(this);
	
	this.Type = "Player";
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [0];
	this.Sprite.OffsetY = -4;
	
	this.Layer = 2;
	
	// Make the player happy!
	this.CorrectMovement = true;

	// A turn missed by a few pixels is still made (PLAYER_TURN_ASSIST, see GameEntityManager.MoveEntity)
	this.TurnAssist = PLAYER_TURN_ASSIST;
	
	this.Solid = true;
	
	// Extend touch border!
	this.TouchBorder = 1;
	
	// Can push!
	this.CanPush = true;
	
	// Available bombs
	this.Bombs = 1;
	
	// Explosion power
	this.Power = 1;

	// Total number of bombs
	this.TotalBombs = this.Bombs;
	
	// Is player dead?
	this.IsDead = false;
	
	// Invulnerability timer
	this.InvulnerableTime = 0.0;
    
    // Invulnerable blinker
    this.Blinker = 0.0;
	
	// Player slot (0-3) and spawn tile position
	this.Index = 0;
	this.SpawnX = 0;
	this.SpawnY = 0;

	// Keys are shared by the whole team
	Object.defineProperty(this, "KeyFlags",
	{
		get: function() { return PlayerManager.KeyFlags; },
		set: function(v) { PlayerManager.KeyFlags = v; }
	});
	
    // Lifes
    this.Lifes = 3;
    
	// Hearts
	this.Hearts = 3;
    
    // Skate timer
    this.SkateTime = 0.0;
    
    // Pushable bombs powerup timer
    this.PushableBombsTime = 0.0;

    // Superbombs timer
    this.SuperBombsTime = 0.0;
    
    // Bad luck "powerdown" timer
    this.BadLuckTime = 0.0;

    // Bad luck flags
    // --------------
    //   1 - slow speed
    //   2 - fast speed
    //   4 - slow poop
    //   8 - quick poop
    //  16 - no bombs
    //  32 - no fire
    //  64 - random explosions
    // 128 - random bomb pushes
    this.BadLuckFlags = 0;
	
	var lastX = -1, lastY = -1;

	this.Tick = function(delta)
	{
		if (!this.Sprite.Sheet && this.Index > 0)
			this.Sprite.Sheet = Tint.GetSheet(this.Index);

		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
		var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);
		
		if (ax != lastX || ay != lastY)
		{
			for (var i = 1; i <= 4; ++i)
			{
				var b = GameWorld.GetBlockInDirection(ax, ay, i);
				
				if ((b == 'A' && (this.KeyFlags & 1)) ||
				    (b == 'B' && (this.KeyFlags & 2)) ||
				    (b == 'C' && (this.KeyFlags & 4)) ||
				    (b == 'D' && (this.KeyFlags & 8)))
				{
					GameWorld.SetBlockInDirection(ax, ay, i, ' ');
					Engine.PlaySound("audioDoor");
				}
			}
		
			lastX = ax;
			lastY = ay;
		}
        
        if (this.InvulnerableTime > 0.0)
        {
            this.Sprite.Visible = this.Blinker > 1.0;
            this.Blinker += delta * 20;
            this.InvulnerableTime -= delta;
            
            if (this.Blinker >= 2.0)
                this.Blinker -= 2.0;
                
            if (this.InvulnerableTime < 0.0)
                this.InvulnerableTime = 0.0;
        }
        else
            this.Sprite.Visible = true;
            
        if (this.SkateTime > 0.0)
        {
            this.Speed = 2;
            this.SkateTime -= delta;
            
            if (this.SkateTime < 0.0)
                this.SkateTime = 0.0;
        }
        else
            this.Speed = 1;
            
        if (this.PushableBombsTime > 0.0)
        {
            this.PushableBombsTime -= delta;
            
            if (this.PushableBombsTime < 0.0)
                this.PushableBombsTime = 0.0;
        }

        if (this.SuperBombsTime > 0.0)
        {
            this.SuperBombsTime -= delta;
            
            if (this.SuperBombsTime < 0.0)
                this.SuperBombsTime = 0.0;
        }
        
        if (this.BadLuckTime > 0.0)
        {
            this.BadLuckTime -= delta;
            
            if (this.BadLuckTime < 0.0)
            {
                this.BadLuckTime = 0.0;
                this.BadLuckFlags = 0;
            }

            // Bad luck flags
            // --------------
            //  1 - slow speed
            //  2 - fast speed
            //  4 - slow poop
            //  8 - quick poop
            // 16 - no bombs
            // 32 - no fire
            // 64 - random explosions
            if (this.BadLuckFlags & 1)
                this.Speed = 0.5;
                
            if (this.BadLuckFlags & 2)
                this.Speed = 2;
                
            if (this.BadLuckFlags & 4 && Math.random() < 0.01)
            {
                if (this.Poop())
                    Engine.PlaySound("audioPoop");
            }
                
            if (this.BadLuckFlags & 8)
            {
                if (this.Poop())
                    Engine.PlaySound("audioPoop");
            }
        }            
	}
	
	this.OnTouch = function(entity, overlapFactor)
	{
		if (this.IsDead)
			return;
	
		switch (entity.Type)
		{
			case "Key":
				if (overlapFactor > 0.6)
				{
					entity.Health = 0.0;
					Engine.PlaySound("audioKey");
					
					this.KeyFlags |= (1 << entity.KeyType);
				}
				break;
		
			case "PowerUp":
				if (overlapFactor > 0.6 && entity.Health > 0.0)
				{
					entity.Health = 0.0;
					Engine.PlaySound("audioPickUp");
					
					switch (entity.PowerUpType)
					{
						case 0:
							++this.Power;
							break;
							
						case 1:
							++this.Bombs;
                            ++this.TotalBombs;
							break;
                            
                        case 2:
                            this.SkateTime += 10.0;
                            break;
                            
                        case 3:
                            this.PushableBombsTime += 20.0;
                            break;
                            
                        case 4:
                            if (this.Hearts < 3)
                                ++this.Hearts;
                                
                            break;
                            
                        case 5:
                            this.GetBadLuck();
                            break;
                            
                        case 6:
                            ++this.Lifes;                        
                            break;
                            
                        case 7:
                            this.SuperBombsTime += 20.0;
                            break;
					}
				}
				break;
				
			case "Explosion":
				// A bomb's blast needs most of the player in it; an enemy's flame (laser, shot) hurts on any overlap of the boxes
				if (entity.Owner && entity.Owner.Type == "Enemy" ? this.Overlaps(entity) : overlapFactor > 0.5)
				{
                    this.GetHit();
				}
				break;

			case "Shot":
				// An enemy's fire shot that runs into a player bursts on it
				if (this.Overlaps(entity))
					entity.Burst();
				break;
				
			case "Enemy":
				// Only a real overlap of the two boxes hurts (OnExtendedTouch also reports enemies that merely stand next to us)
				if (this.Overlaps(entity))
					this.GetHit();
				break;
		}
	}
	
	// Do the boxes of this player and `entity` overlap (by at least a pixel)?
	this.Overlaps = function(entity)
	{
		return BoxIntersection(this.X, this.Y, this.X + this.Width - 1, this.Y + this.Height - 1,
			entity.X, entity.Y, entity.X + entity.Width - 1, entity.Y + entity.Height - 1);
	}

	this.OnExtendedTouch = function(entity, overlapFactor)
	{
		this.OnTouch(entity, overlapFactor);
	}
	
	this.OnDirectionChange = function()
	{
		if (this.IsDead)
			return;
	
		switch (this.Direction)
		{
			case 1: this.Sprite.Frames = [9, 10, 9, 11]; break;
			case 2: this.Sprite.Frames = [3, 4, 3, 5]; break;
			case 3: this.Sprite.Frames = [0, 1, 0, 2]; break;
			case 4: this.Sprite.Frames = [6, 7, 6, 8]; break;
			
			default:
			case 0:
				switch (this.LastDirection)
				{
					case 1: this.Sprite.Frames = [9]; break;
					case 2: this.Sprite.Frames = [3]; break;
					default:
					case 3: this.Sprite.Frames = [0]; break;
					case 4: this.Sprite.Frames = [6]; break;
				}
				break;
		}
		
		this.Sprite.Loop = true;
	}
	
	// Translate a held direction (0 = none) into movement requests.
	this.ApplyInputDirection = function(dir)
	{
		if (this.IsDead || dir == 0)
		{
			this.Direction = 0;
			this.NextDirection = 0;
			return;
		}

		if ((this.Direction == 0 && this.NextDirection == 0) || dir != this.Direction)
			this.EnableDirection(dir);
	}
	
	this.Poop = function()
	{
		if (this.Bombs <= 0 || this.IsDead || (this.BadLuckFlags & 16))
			return false;
	
		var bx = Math.floor((this.X + this.Width / 2) / GameWorld.BlockWidth);
		var by = Math.floor((this.Y + this.Height / 2) / GameWorld.BlockHeight);
		
		bx *= GameWorld.BlockWidth;
		by *= GameWorld.BlockHeight;	
	
		if (GameEntityManager.IsEntityFreeSpotThere(this, bx, by, bx + this.Width - 1, by + this.Height - 1) && !GameEntityManager.IsEntityTypeThere("Explosion", bx, by, bx + this.Width - 1, by + this.Height - 1))
		{
			var bomb = new Bomb();
			bomb.X = this.X;
			bomb.Y = this.Y;
			bomb.ExplosionSize = this.Power;
			bomb.Owner = this;
            
            if (this.SuperBombsTime > 0.0)
                bomb.IsSuperBomb = true;
                
            // No explosion bad luck
            if (this.BadLuckFlags & 32)
                bomb.ExplosionSize = 1;
                
            // Random explosion time
            if (this.BadLuckFlags & 64)
                bomb.ExplosionTime += (-1.0) + (Math.random() * 10.0);
                
            // Random push directions
            if (this.BadLuckFlags & 128)
            {
                bomb.Pushable = true;
                bomb.Direction = 1 + parseInt(Math.random() * 4.0);
                
                if (bomb.Direction == this.Direction)
                    bomb.Direction = 0;
            }

            if (bomb.IsSuperBomb)
            {
                bomb.Sprite.IndexOffset = 17;
            }
                			
			bomb.AlignToWorldGrid();
			//GameWorld.AddDangerCross(bomb.X, bomb.Y, bomb.ExplosionSize + 1, 1);
			
			Engine.PlaySound("audioBombDrop");
			--this.Bombs;
			
			return true;
		}
		
		return false;
	}
	
	this.GetHit = function()
	{
        if (this.InvulnerableTime > 0.0)
            return;
    
        if (this.Hearts > 0)
        {
            Engine.PlaySound("audioHit");
        
            this.InvulnerableTime = 2.0;
            this.Blinker = 0.0;
            
            --this.Hearts;
        }
        else
            this.Die();
	}

	// Dead at once - no heart or invulnerability helps (also: crushed by a closing battle wall).
	this.Die = function()
	{
		if (this.IsDead)
			return;

		Engine.PlaySound("audioDie");

		this.Direction = 0;
		this.NextDirection = 0;
		this.IsDead = true;
		this.Solid = false;

		this.Sprite.Frames = [12, 13];
		this.Sprite.Loop = true;
		this.Sprite.AnimationSpeed = 2.0;
	}

    // Bad luck flags
    // --------------
    //   1 - slow speed
    //   2 - fast speed
    //   4 - slow poop
    //   8 - quick poop
    //  16 - no bombs
    //  32 - no fire
    //  64 - random explosions
    // 128 - random bomb pushes
    
    this.GetBadLuck = function()
    {
        this.BadLuckTime += 10.0;
        
        if (Math.random() < 0.1 && this.Hearts > 0)
            this.GetHit();
        
        var flag = 1;
        for (var i = 0; i < 16; ++i, flag *= 2)
        {
            if (Math.random() < 0.5)
                this.BadLuckFlags |= flag;        
        }
        
        if ((this.BadLuckFlags & 1) && (this.BadLuckFlags & 2) && Math.random() < 0.5)
            this.BadLuckFlags &= ~1; 

        if ((this.BadLuckFlags & 4) && (this.BadLuckFlags & 8) && Math.random() < 0.5)
            this.BadLuckFlags &= ~4;
            
        if ((this.BadLuckFlags & 16) && (this.BadLuckFlags & 32) && Math.random() < 0.5)
            this.BadLuckFlags &= ~16; 
    }
}

Player.prototype = new GameEntity;
