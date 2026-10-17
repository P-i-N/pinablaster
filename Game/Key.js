// Key class
function Key(type)
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "Key";
	this.Solid = false;
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [0];
	this.Sprite.IndexOffset = 98 + type * 20;
	this.Sprite.AnimationSpeed = 10.0;
	this.Sprite.Loop = false;
	
	this.Layer = -1;
	
	this.KeyType = type; 
	
	this.OnTouch = function(entity, overlapFactor)
	{

	}
}

Key.prototype = new GameEntity();
