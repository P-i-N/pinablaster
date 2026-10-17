// Game entity manager class prototype
function GameEntityManagerPrototype()
{
	Engine.RegisterModule(this);

	this.Entities = [];
	
	this.LastID = 0;

	// Register game entity
	this.RegisterEntity = function(entity)
	{
		entity.ID = ++this.LastID;
		
		this.Entities.push(entity);	
	}
	
	// Unregister game entity (DO NOT USE THIS UNLESS YOU KNOW WHAT YOU ARE DOING!)
	this.UnregisterEntity = function(entity)
	{
		return this.Entities.remove(entity);		
	}
    
    this.GetNumEntitiesByType = function(type)
    {
        var result = 0;
    
		// Tick entities
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];
			
            if (e.Type == type)
                ++result;
		}
        
        return result;        
    }
	
	// Module initialization
	this.Init = function()
	{
	
	}	
	
	// Tick entities
	this.Tick = function(delta)
	{
		// Tick entities
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];
			e.Tick(delta);
            e.Time += delta;
		}

		// Push entities
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];
			
			if (e.CanPush)
				this.PushEntitiesAround(e);
		}

		// Move entities (and let them touch)
		var count = this.Entities.length;
		var loose = [];

		for (var k = 0; k < count; ++k)
			if (!this.Entities[k].Static)
				loose.push(k);

		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];

			// Process entity movement
			if (e.Speed >= 1)
			{
				for (var j = 0; j < e.Speed; ++j)
				{
					this.MoveEntity(e);
				}
			}
			else
			{
				var counter = 1.0 / e.Speed;
				
				if (e.SpeedUpdateCounter <= 0)
				{
					e.SpeedUpdateCounter = counter;
					this.MoveEntity(e);
				}
				
				--e.SpeedUpdateCounter;
			}

			// Process entity touching. Two pieces of static floor (magic carpets, drains) never react to each other, so a
			// static one only has to look at the others (`loose`); entities created meanwhile come last, as before.
			var ents = this.Entities;
			var walk = e.Static ? loose : null;
			var wi = 0;

			if (walk)
			{
				while (wi < walk.length && walk[wi] <= i)
					++wi;
			}

			// e's box: read again after a touch (that may move it); the other one is read afresh for every pair
			var ex1 = e.X, ey1 = e.Y, ex2 = ex1 + e.Width - 1, ey2 = ey1 + e.Height - 1;

			for (var jj = walk ? wi : i + 1; ; ++jj)
			{
				var j;

				if (walk)
				{
					if (jj < walk.length)
						j = walk[jj];
					else
					{
						j = Math.max(count, i + 1) + (jj - walk.length);

						if (j >= ents.length)
							break;
					}
				}
				else
				{
					j = jj;

					if (j >= ents.length)
						break;
				}

				var te = ents[j];
				var tx1 = te.X, ty1 = te.Y;

				if (tx1 > ex2 || ty1 > ey2 || tx1 + te.Width - 1 < ex1 || ty1 + te.Height - 1 < ey1)
					continue;

				if (e.Static && te.Static)
					continue;

				var of = BoxOverlapFactor(ex1, ey1, ex2, ey2, tx1, ty1, tx1 + te.Width - 1, ty1 + te.Height - 1);

				e.OnTouch(te, of);
				te.OnTouch(e, of);

				ex1 = e.X; ey1 = e.Y; ex2 = ex1 + e.Width - 1; ey2 = ey1 + e.Height - 1;
			}

			// Process entity extended touching: te touches the box of e stretched by TouchBorder sideways or up and down
			if (e.TouchBorder > 0)
			{
				var tb = e.TouchBorder;
				var ex1 = e.X, ey1 = e.Y, ex2 = ex1 + e.Width - 1, ey2 = ey1 + e.Height - 1;

				for (var j = 0; j < this.Entities.length; ++j)
				{
					var te = this.Entities[j];

					if (te == e) continue;

					var tx1 = te.X, ty1 = te.Y, tx2 = tx1 + te.Width - 1, ty2 = ty1 + te.Height - 1;

					if (tx2 < ex1 - tb || tx1 > ex2 + tb || ty2 < ey1 - tb || ty1 > ey2 + tb)
						continue;

					if (!((ty2 >= ey1 && ty1 <= ey2) || (tx2 >= ex1 && tx1 <= ex2)))
						continue;

					var of = BoxOverlapFactor(ex1, ey1, ex2, ey2, tx1, ty1, tx2, ty2);

					e.OnExtendedTouch(te, of);
					te.OnExtendedTouch(e, of);

					ex1 = e.X; ey1 = e.Y; ex2 = ex1 + e.Width - 1; ey2 = ey1 + e.Height - 1;
				}
			}

			if (e.Direction != e.LastDirection)
				e.OnDirectionChange();

			if (e.Sprite != null)
				e.Sprite.Tick(delta);
			
			e.LastDirection = e.Direction;
			e.Time += delta;
		}
	
		// Post tick entities
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];
			e.PostTick(delta);
		}	
	
		// Delete dead entities
		var i = 0;
		while (i < this.Entities.length)
		{
			var e = this.Entities[i];
			
			if (e.Health <= 0.0)
				this.Entities.remove(e);
			else
				++i;
		}
	}
	
	// Can `pusher` push `ent` along? Ice blocks and the like can be pushed by anybody; a bomb only by somebody with the push
	// (kick) power-up - any bomb, whoever dropped it.
	this.PushableBy = function(ent, pusher)
	{
		return ent.Pushable || (ent.Type == "Bomb" && !!pusher && pusher.PushableBombsTime > 0.0);
	}

	// Do these two walk through each other? (players with players and with enemies)
	this.PassesThrough = function(a, b)
	{
		return (a.Type == "Player" && (b.Type == "Player" || b.Type == "Enemy")) || (a.Type == "Enemy" && b.Type == "Player");
	}

	this.EntityCollision = function(e, dir, x1, y1, x2, y2, nx1, ny1, nx2, ny2, allowPushables)
	{
		if (GameWorld.TestCollision(nx1, ny1, nx2, ny2))
			return true;
				
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var ent = this.Entities[i];
			
			if (ent == e || !ent.Solid) continue;

			// Players walk through each other, and through enemies and the other way round: an enemy hurts by touching (boxes
			// overlapping), which it could never do if the two blocked each other
			if (this.PassesThrough(e, ent)) continue;

			// Is old position intersecting?
			var oldInt = BoxIntersection(ent.X, ent.Y, ent.X + ent.Width - 1, ent.Y + ent.Height - 1, x1, y1, x2, y2);
			
			// Is new position intersecting?
			var newInt = BoxIntersection(ent.X, ent.Y, ent.X + ent.Width - 1, ent.Y + ent.Height - 1, nx1, ny1, nx2, ny2);
			
			if (!oldInt && newInt)
			{
				if (this.PushableBy(ent, e) && allowPushables)
				{
					if (!this.CanMoveInDirection(ent, dir, false))
						return true; 				
				}
				else
					return true;
			}
		}

		return false;
	}
	
	this.CanMoveInDirection = function(e, dir, allowPushables)
	{
		var x1 = e.X;
		var y1 = e.Y;
		var x2 = e.X + e.Width - 1;
		var y2 = e.Y + e.Height - 1;
		
		var nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
		
		switch (dir)
		{
			case 1: --ny1; --ny2; break;
			case 2: ++nx1; ++nx2; break;
			case 3: ++ny1; ++ny2; break;
			case 4: --nx1; --nx2; break;
		}
		
		if (GameWorld.TestCollision(nx1, ny1, nx2, ny2))
			return false;		
		
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var ent = this.Entities[i];
			
			if (ent == e || !ent.Solid) continue;

			// Players walk through each other, and through enemies and the other way round: an enemy hurts by touching (boxes
			// overlapping), which it could never do if the two blocked each other
			if (this.PassesThrough(e, ent)) continue;

			// Is old position intersecting?
			var oldInt = BoxIntersection(ent.X, ent.Y, ent.X + ent.Width - 1, ent.Y + ent.Height - 1, x1, y1, x2, y2);
			
			// Is new position intersecting?
			var newInt = BoxIntersection(ent.X, ent.Y, ent.X + ent.Width - 1, ent.Y + ent.Height - 1, nx1, ny1, nx2, ny2);
			
			if (!oldInt && newInt)
			{
				if ((this.PushableBy(ent, e) || ent.CanPush) && allowPushables)
				{
					if (!this.CanMoveInDirection(ent, dir, false))
						return false;
				}
				else
					return false;
			}
		}
		
		return true;
	}
	
	this.IsEmptySpotThere = function(x1, y1, x2, y2)
	{
		if (GameWorld.TestCollision(x1, y1, x2, y2))
			return false;
			
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];
			
			if (e.Solid)
			{
				if (BoxIntersection(e.X, e.Y, e.X + e.Width - 1, e.Y + e.Height - 1, x1, y1, x2, y2))
					return false;			
			}
		}
	
		return true;
	}
	
	this.IsEntityTypeThere = function(entityTypeName, x1, y1, x2, y2)
	{
		if (GameWorld.TestCollision(x1, y1, x2, y2))
			return false;
			
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];
			
			if (e.Type == entityTypeName && BoxIntersection(e.X, e.Y, e.X + e.Width - 1, e.Y + e.Height - 1, x1, y1, x2, y2))
                return true;
		}
	
		return false;
	}    
    
	this.IsEntityFreeSpotThere = function(exclude, x1, y1, x2, y2)
	{
		if (GameWorld.TestCollision(x1, y1, x2, y2))
			return false;
			
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var e = this.Entities[i];
			
			if (e == exclude || !e.Solid)
				continue;
			
			if (BoxIntersection(e.X, e.Y, e.X + e.Width - 1, e.Y + e.Height - 1, x1, y1, x2, y2))
				return false;			
		}
	
		return true;
	}	
	
	this.SendMessage = function(sender, msg)
	{
		for (var i = 0; i < this.Entities.length; ++i)
			this.Entities[i].OnMessage(sender, msg);
	}
	
	this.PushEntitiesAround = function(e)
	{
		if (e.NextDirection == 0)
			return;
			
		var x1 = e.X;
		var y1 = e.Y;
		var x2 = x1 + e.Width - 1;
		var y2 = y1 + e.Height - 1;

		nx1 = x1; ny1 = y1; nx2 = x2; ny2 = y2;
	
		switch (e.NextDirection)
		{
			case 1: --ny1; --ny2; break;
			case 2: ++nx1; ++nx2; break;
			case 3: ++ny1; ++ny2; break;
			case 4: --nx1; --nx2; break;
		}
		
		var pushed = false;
		
		for (var i = 0; i < this.Entities.length; ++i)
		{
			var ent = this.Entities[i];
			
			if (this.PushableBy(ent, e) && !GameWorld.TestCollision(nx1, ny1, nx2, ny2))
			{
				if (
					BoxIntersection(nx1, ny1, nx2, ny2, ent.X, ent.Y, ent.X + ent.Width - 1, ent.Y + ent.Height - 1) &&
					!BoxIntersection(e.X, e.Y, e.X + e.Width - 1, e.Y + e.Height - 1, ent.X, ent.Y, ent.X + ent.Width - 1, ent.Y + ent.Height - 1)
				)
				{
					if (this.CanMoveInDirection(ent, e.Direction, false))
					{
						/*
						switch (e.NextDirection)
						{
							case 1: --ent.Y; break;
							case 2: ++ent.X; break;
							case 3: ++ent.Y; break;
							case 4: --ent.X; break;
						}
						*/
					}

					ent.Direction = e.NextDirection;
					pushed = true;
				}
			}
		}
		
		return pushed;
	}
	
	// Turn assist (see GameEntity.TurnAssist). The entity moves along one axis (Direction) and has a turn to the side queued
	// (NextDirection) that it cannot make yet because it is not level with the opening. If it has just passed the opening - by
	// at most e.TurnAssist pixels, the way into the opening is free from there and the way back is free - it is moved one pixel
	// back (returns true: that was its move). Once level, MoveEntity makes the turn the usual way.
	this.TurnAssistStep = function(e)
	{
		var d = e.Direction, n = e.NextDirection;
		var horizontal = d == 2 || d == 4;

		// only a turn to the side, from a straight run along the tile rows / columns
		if (d == 0 || n == 0 || (horizontal ? (n != 1 && n != 3) : (n != 2 && n != 4)))
			return false;

		var W = e.Width, H = e.Height;

		if (horizontal ? e.Y % H != 0 : e.X % W != 0)
			return false;

		// how far past the opening (the aligned tile position) it is, and where that is
		var pos = horizontal ? e.X : e.Y, size = horizontal ? W : H;
		var rest = pos % size;
		var passed = (d == 2 || d == 3) ? rest : (rest == 0 ? 0 : size - rest);

		if (passed == 0 || passed > e.TurnAssist)
			return false;

		var back = (d == 2 || d == 3) ? -passed : passed;
		var ax = horizontal ? e.X + back : e.X, ay = horizontal ? e.Y : e.Y + back;
		var bx = ax, by = ay;

		// the way into the opening, from the level position
		switch (n)
		{
			case 1: --by; break;
			case 2: ++bx; break;
			case 3: ++by; break;
			case 4: --bx; break;
		}

		if (this.EntityCollision(e, n, ax, ay, ax + W - 1, ay + H - 1, bx, by, bx + W - 1, by + H - 1, true))
			return false;

		// one step back towards it (the way back must be free: a bomb dropped behind us stops this)
		var sx = e.X, sy = e.Y;

		switch (d)
		{
			case 1: ++sy; break;
			case 2: --sx; break;
			case 3: --sy; break;
			case 4: ++sx; break;
		}

		if (this.EntityCollision(e, d == 1 ? 3 : d == 2 ? 4 : d == 3 ? 1 : 2, e.X, e.Y, e.X + W - 1, e.Y + H - 1, sx, sy, sx + W - 1, sy + H - 1, false))
			return false;

		e.X = sx;
		e.Y = sy;

		return true;
	}

	this.MoveEntity = function(e)
	{
		// Not moving and not about to: nothing below can change (saves a collision scan per resting entity).
		if (e.Direction == 0 && e.NextDirection == 0)
			return;

		var nx1, ny1, nx2, ny2;
		
		var x1 = e.X;
		var y1 = e.Y;
		var x2 = x1 + e.Width - 1;
		var y2 = y1 + e.Height - 1;
		
		if (e.Direction == 0)
		{
			e.Direction = e.NextDirection;
			e.NextDirection = 0;
		}
		
		if (e.NextDirection > 0)
		{
			nx1 = x1; ny1 = y1; nx2 = x2; ny2 = y2;
		
			switch (e.NextDirection)
			{
				case 1: --ny1; --ny2; break;
				case 2: ++nx1; ++nx2; break;
				case 3: ++ny1; ++ny2; break;
				case 4: --nx1; --nx2; break;
			}
		
			if (this.EntityCollision(e, e.NextDirection, x1, y1, x2, y2, nx1, ny1, nx2, ny2, true) == false)
			{
				e.Direction = e.NextDirection;
				e.NextDirection = 0;
			}
		}

		// A turn queued too late: back up to the opening that was just passed (it is taken above once the entity is level with it)
		if (e.TurnAssist > 0 && e.NextDirection > 0 && this.TurnAssistStep(e))
			return;

		nx1 = x1; ny1 = y1; nx2 = x2; ny2 = y2;
		
		switch (e.Direction)
		{
			case 1: --ny1; --ny2; break;
			case 2: ++nx1; ++nx2; break;
			case 3: ++ny1; ++ny2; break;
			case 4: --nx1; --nx2; break;
		}
		
		if (this.EntityCollision(e, e.Direction, x1, y1, x2, y2, nx1, ny1, nx2, ny2, false) == false)
		{
			e.X = nx1;
			e.Y = ny1;
		}
		else
		{
			if (e.CorrectMovement)
			{
				var corrX = e.Width / 2;
				var corrY = e.Height / 2;
				var mX = x1 % e.Width;
				var mY = y1 % e.Height;
				
				var shouldCorrect = false;
			
				switch (e.Direction)
				{
				    case 1:
					case 3:
						if (mX >= corrX)
						{
							shouldCorrect = true;
							x1 += e.Width - mX;
						}
						else if (mX <= e.Width - corrX)
						{
							shouldCorrect = true;
							x1 -= mX;
						}
						break;

				    case 2:
					case 4:
						if (mY >= corrY)
						{
							shouldCorrect = true;
							y1 += e.Height - mY;
						}
						else if (mY <= e.Height - corrY)
						{
							shouldCorrect = true;
							y1 -= mY;
						}
						break;
				}
				
				if (shouldCorrect)
				{
				    x2 = x1 + e.Width - 1;
				    y2 = y1 + e.Height - 1;
				
					nx1 = x1; ny1 = y1; nx2 = x2; ny2 = y2;

					switch (e.Direction)
					{
						case 1: --ny1; --ny2; break;
						case 2: ++nx1; ++nx2; break;
						case 3: ++ny1; ++ny2; break;
						case 4: --nx1; --nx2; break;
					}
					
					if (this.EntityCollision(e, e.Direction, x1, y1, x2, y2, nx1, ny1, nx2, ny2, true) == false)
					{
						e.NextDirection = e.Direction;
						
						switch (e.Direction)
						{
						    case 1:
							case 3:
								if (x1 < e.X) e.Direction = 4;
								if (x1 > e.X) e.Direction = 2;
								break;

						    case 2:
							case 4:
								if (y1 < e.Y) e.Direction = 1;
								if (y1 > e.Y) e.Direction = 3;
								break;
						}
					}
				}
			}
			else
			{
				e.Direction = e.NextDirection;
				e.NextDirection = 0;
			}
		}
	}
}

// Global game entity manager instance
var GameEntityManager = new GameEntityManagerPrototype();
