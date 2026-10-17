// Hot (dying) wall
function HotWall()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "HotWall";
	this.Solid = true;
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [63, 64, 65, 66];
	this.Sprite.AnimationSpeed = 3.5;
	this.Sprite.Loop = false;
	
	this.Layer = 1;
	
	this.Tick = function(delta)
	{
		if (this.Sprite.IsFinished())
		{
			this.Health = 0.0;
		}
	}	
}

HotWall.prototype = new GameEntity();
