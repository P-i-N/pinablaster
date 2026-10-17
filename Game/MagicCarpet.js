// Magic carpet class
function MagicCarpet(dir)
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "MagicCarpet";
	this.Solid = false;
	this.Layer = -2;

	// Static floor: never moves; touches between two static entities are skipped
	this.Static = true;
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [0, 1, 2];
	this.Sprite.IndexOffset = 74 + dir * 20;
	this.Sprite.Loop = true;
	this.Sprite.AnimationSpeed = 5.0;
	
	this.MagicDirection = dir;
	
	this.OnTouch = function(entity, overlapFactor)
	{
		if (entity.Solid && entity.Type != "Player")
		{
			if (GameEntityManager.CanMoveInDirection(entity, this.MagicDirection, false))
			{
				switch (this.MagicDirection)
				{
					case 1: --entity.Y; break;
					case 2: ++entity.X; break;
					case 3: ++entity.Y; break;
					case 4: --entity.X; break;
				}
				
				entity.Direction = 0;
			}
		}
	}
}

MagicCarpet.prototype = new GameEntity();
