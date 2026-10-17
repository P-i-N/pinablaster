// Bomb class
function Bomb()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "Bomb";
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [61, 60, 62, 60];
	
	this.ExplosionSize = 1;
    this.ExplosionTime = 2.0;

    this.IsSuperBomb = false;
	
	var lastX = -1, lastY = -1;
	
	this.Tick = function(delta)
	{
		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
		var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);
		
		if (this.X != lastX || this.Y != lastY)
		{
			if (lastX >= 0 && lastY >= 0)
				GameWorld.AddDangerCross(lastX, lastY, this.ExplosionSize + 1, -1);

			GameWorld.AddDangerCross(this.X, this.Y, this.ExplosionSize + 1, 1);
		
			lastX = this.X;
			lastY = this.Y;
		}
        
        this.ExplosionTime -= delta;
		if (this.ExplosionTime <= 0.0)
		{
			this.Explode();
		}
	}
	
	this.OnTouch = function(entity, overlapFactor)
	{
		if (entity.Type == "Explosion" && entity.Owner != this && this.Health > 0 && overlapFactor > 0.1)
			this.Explode();
	}
	
	this.OnMessage = function(sender, msg)
	{
		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
		var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);
	
		switch (msg)
		{
			case "add_danger_level":
				GameWorld.AddDangerCross(this.X, this.Y, this.ExplosionSize + 1, 1);
				lastX = this.X;
				lastY = this.Y;
				break;

			case "remove_danger_level":
				GameWorld.AddDangerCross(lastX, lastY, this.ExplosionSize + 1, -1);
				break;
		}
	}
	
	this.Explode = function()
	{
		if (this.Health <= 0.0)
			return;
			
		this.AlignToWorldGrid();
		this.Health = 0.0;

		GameEntityManager.SendMessage(this, "exploding");
		
		if (this.Owner && this.Owner.Type == "Player")
			++this.Owner.Bombs;
		
		var exp;
		
		this.Tick(0);

		var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
		var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);

		GameWorld.AddDangerCross(ax, ay, this.ExplosionSize + 1, -1);
		CreateExplosionCross(this, ax, ay, this.ExplosionSize, !this.IsSuperBomb);
		
		Engine.PlaySound("audioExplosion" + Math.floor(1 + Math.random() * 5.0).toString());
	}
}

Bomb.prototype = new GameEntity;