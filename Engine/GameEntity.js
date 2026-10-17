// Game entity class
function GameEntity()
{
	// Entity name
	this.Name = "";
	
	// Entity ID (assigned after registration)
	this.ID = 0;
	
	// Entity type
	this.Type = "Entity";
	
	// Entity owner
	this.Owner = null;

	// Position and size
	this.X = 0.0;
	this.Y = 0.0;
	this.Width = 17;
	this.Height = 17;
	
	// Touch border size
	this.TouchBorder = 0;
	
	// from -2 to +2
	this.Layer = 0;
	
	// Time since creation
	this.Time = 0.0;
	
	// Health (0.0 or less = DEAD!)
	this.Health = 1.0;
	
	// Stops on collisions
	this.Solid = true;
	
	// Blocks the wind of the visual effects (the fluid flows around it); see CollisionGrid
	this.BlocksFluid = false;

	// Can be pushed
	this.Pushable = false;
	
	// Can push other entities?
	this.CanPush = false;
	
	// 0 - not moving, 1 - up, 2 - right, 3 - down, 4 - left
	this.Direction = 0;
	this.NextDirection = 0;
	this.LastDirection = 0;
	
	// Movement speed
	this.Speed = 1;
	
	// Movement speed counter for slow entities
	this.SpeedUpdateCounter = 0;

	// Use movement correction
	this.CorrectMovement = false;

	// Turn assist: a queued turn to the side (NextDirection) that was missed by up to this many pixels - the entity ran past the
	// opening - is still taken: it is moved back to the opening first. 0 = off.
	this.TurnAssist = 0;

	// Graphics representation of this entity
	this.Sprite = null;
	
	// Try to push entity in desired direction
	this.EnableDirection = function(dir)
	{
		if (this.Direction == dir || this.NextDirection == dir)
			return;
		
		this.NextDirection = dir;
	}
	
	// Try to stop entity from moving in direction
	this.DisableDirection = function(dir)
	{
		if (this.Direction == dir && this.NextDirection == 0)
			this.Direction = 0;
		else if (this.NextDirection == dir)
			this.NextDirection = 0;
	}
	
	this.AlignToWorldGrid = function()
	{
		this.X = GameWorld.GetAlignedX(this.X + this.Width / 2);
		this.Y = GameWorld.GetAlignedY(this.Y + this.Height / 2);
	}
	
	// Ticking function
	this.Tick = function(delta)
	{
	
	}
	
	// Post tick (after everything has been ticked)
	this.PostTick = function(delta)
	{
	
	}
	
	// Event raised when touching other entity
	this.OnTouch = function(entity, overlapFactor)
	{
	
	}
	
	this.OnExtendedTouch = function(entity, overlapFactor)
	{
        this.OnTouch(entity, overlapFactor);	
	}
	
	// Whe two entities are aligned to world grid and touching with edges
	this.OnEdgeTouch = function(entity)
	{
	
	}
	
	// Event raised when entity direction has been changed
	this.OnDirectionChange = function()
	{
	
	}
	
	this.OnMessage = function(sender, msg)
	{
	
	}
}
