function Drain()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "Drain";
	this.Solid = false;
	this.Layer = -2;

	// Static floor: never moves; touches between two static entities are skipped
	this.Static = true;
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [76];
	this.Sprite.Loop = false;
	
	this.Bomb = null;
	
	this.OnTouch = function(entity, overlapFactor)
	{
		if (entity.Type == "Bomb" && overlapFactor > 0.5)
			this.Bomb = entity;			
	}
	
	this.OnMessage = function(sender, msg)
	{
		if (sender == this.Bomb && msg == "exploding")
		{
    		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
            var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);

    		var bx = GameWorld.GetAlignedX(sender.X + sender.Width / 2);
            var by = GameWorld.GetAlignedY(sender.Y + sender.Height / 2);
            
            if (ax == bx && ay == by)
            {
    			for (var i = 0; i < GameEntityManager.Entities.length; ++i)
    			{
    				var e = GameEntityManager.Entities[i];
    				
    				// every other drain blows with the same strength as the bomb (a super bomb burns through soft walls too)
    				if (e.Type == "Drain" && e != this)
    					CreateExplosionCross(this.Bomb, e.X, e.Y, this.Bomb.ExplosionSize, !this.Bomb.IsSuperBomb);
    			}
            }
			
			this.Bomb = null;			
		}
	}
}

Drain.prototype = new GameEntity();
