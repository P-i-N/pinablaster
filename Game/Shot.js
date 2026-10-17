// Shot class
function Shot()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "Shot";
	this.Solid = false;
    
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [0, 1, 2, 3];
	this.Sprite.IndexOffset = 180;
	this.Sprite.AnimationSpeed = 3.0;
	this.Sprite.Loop = true;
	
	this.Layer = -1;
	
	// A player walking into the shot, or the shot flying into a player: it bursts (the player's own OnTouch sees to the rest)
	this.OnTouch = function(entity, overlapFactor)
	{
		if (entity.Type == "Player" && !entity.IsDead && entity.Overlaps(this))
			this.Burst();
	}

	this.Burst = function()
	{
		this.Direction = 0;
		this.NextDirection = 0;
	}
    
    this.Tick = function(delta)
    {
        if (this.Direction == 0)
        {
            this.Health = 0.0;
            
            CreateExplosionCross(this.Owner, this.X, this.Y, 1, true);
            
            Engine.PlaySound("audioExplosion" + Math.floor(1 + Math.random() * 5.0).toString());
        }
    }
}

Shot.prototype = new GameEntity();
