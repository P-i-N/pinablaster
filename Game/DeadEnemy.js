// Dying enemy
function DeadEnemy()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "DeadEnemy";
	this.Solid = true;
	
	this.Sprite = new Sprite();
	this.Sprite.AnimationSpeed = 2.0;
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

DeadEnemy.prototype = new GameEntity();
