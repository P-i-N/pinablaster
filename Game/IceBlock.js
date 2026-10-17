// Iceblock
function IceBlock()
{
	GameEntityManager.RegisterEntity(this);
	
	this.Type = "IceBlock";
	this.Solid = true;
	
	this.BlocksFluid = true;
	this.Pushable = true;
	this.CorrectMovement = true;
	
	this.Sprite = new Sprite();
	this.Sprite.Frames = [74];
	this.Sprite.AnimationSpeed = 3.5;
	this.Sprite.Loop = true;
	
	this.Layer = 1;
	this.FrozenBomb = false;
	
	this.Tick = function(delta)
	{

	}
	
	this.PostTick = function(delta)
	{
		if ((this.X % GameWorld.BlockWidth) == 0 && (this.Y % GameWorld.BlockHeight) == 0)
		{
			this.NextDirection = 0;
			this.Direction = 0;
		}		
	}
	
	this.OnTouch = function(entity, overlapFactor)
	{
		if (entity.Type == "Explosion" && entity.Owner != this && overlapFactor > 0.1)
		{
			if (this.FrozenBomb)
			{
				CreateExplosionCross(this, this.X, this.Y, 1, true);
			}
			else
			{
				var hw = new HotWall();
				
				hw.X = this.X;
				hw.Y = this.Y;
			}
			
			this.Health = 0.0;
			Engine.PlaySound("audioIcebreak" + Math.floor(1 + Math.random() * 4.0).toString());
		}
	}	
}

IceBlock.prototype = new GameEntity();
