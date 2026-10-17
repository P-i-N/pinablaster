// Renderer class prototype
function RendererPrototype()
{
	Engine.RegisterModule(this);
	
	this.SpriteSheet = null;
	
	this.EnableDebugDraw = false;

	this.MapOffsetX = 58;
	this.MapOffsetY = 0;

	var context = null;
	var width = 0;
	var height = 0;
	
	this.Init = function()
	{
		context = Engine.Context;
		
		if (context == null)
			return false;
			
		width = Engine.Canvas.width;
		height = Engine.Canvas.height;
		
		return true;			
	}

	this.DrawSpriteLayer = function(layer)
	{
		for (var i = 0; i < GameEntityManager.Entities.length; ++i)
		{
			var entity = GameEntityManager.Entities[i];
			
			if (entity.Sprite != null && entity.Layer == layer && entity.Sprite.Visible)
			{
                context.globalAlpha = entity.Sprite.Alpha;
				var sheet = entity.Sprite.Sheet || this.SpriteSheet;
				sheet.DrawSpriteByIndex(context, entity.X + entity.Sprite.OffsetX, entity.Y + entity.Sprite.OffsetY, entity.Sprite.GetActualFrame());
			}
		}
        
        context.globalAlpha = 1.0;
	}
	
	// Registered as a module, but drawing now happens once per frame in Draw().
	this.Tick = function(delta)
	{
	}

	this.Draw = function()
	{
		context.fillStyle = "#000000";
		context.fillRect(0, 0, width, height);

		context.save();
		context.translate(this.MapOffsetX, this.MapOffsetY);

		context.drawImage(GameWorld.CacheImage, 0, 0);

		if (typeof Fx !== "undefined")
			Fx.DrawScorch(context);

		// fragments and shards lie between the ground and the walls
		if (typeof Fx !== "undefined")
			Fx.DrawParticles(context);

		context.drawImage(GameWorld.WallImage, 0, 0);

		this.DrawSpriteLayer(-2);
		this.DrawSpriteLayer(-1);

		if (typeof Fx !== "undefined")
			Fx.DrawSmoke(context);

		this.DrawSpriteLayer(0);
		this.DrawSpriteLayer(1);
		this.DrawSpriteLayer(2);

		if (PlayerManager.Players.length > 1)
			Hud.DrawPlayerLabels(context, PlayerManager.Players);

		if (this.EnableDebugDraw)
			this.DebugDraw();

		context.restore();
	}
	
	this.DebugDraw = function()
	{
		for (var y = 0; y < GameWorld.WorldHeight; ++y)
		{
			for (var x = 0; x < GameWorld.WorldWidth; ++x)
			{
				var danger = GameWorld.DangerLevel[y][x];
				
				var wx = x * GameWorld.BlockWidth;
				var wy = y * GameWorld.BlockHeight;
				
				if (danger > 0)
				{
					context.beginPath();
					context.moveTo(wx, wy);
					context.lineTo(wx + GameWorld.BlockWidth, wy + GameWorld.BlockHeight);
					context.stroke();

					context.beginPath();
					context.moveTo(wx + GameWorld.BlockWidth, wy);
					context.lineTo(wx, wy + GameWorld.BlockHeight);
					context.stroke();
				}
			}
		}
	}
}

var Renderer = new RendererPrototype();
