// Cosmetic particles (brick fragments, ice shards, sparks) carried by the fluid's wind. Pure: no DOM, so Node can test it.
//
// A particle lives on the floor plane (x, y in pixels) and hops in height z (only for the bounce and the shadow).
// It collides with solid tiles through the `solidAt(px, py)` callback and never ends up inside one.
function ParticleSystem(max)
{
	this.Max = max || 600;
	this.List = [];

	this.Gravity = 260;     // px / s^2 pulling z down
	this.Bounce = 0.45;     // vertical energy kept on a bounce
	this.WallBounce = 0.5;  // horizontal energy kept on hitting a wall
	this.AirDrag = 2.2;     // how fast velocity follows the wind while flying (1 / s)
	this.GroundDrag = 5.0;  // friction while sliding on the floor (1 / s)

	// p: { x, y, vx, vy, z, vz, life, color, size, kind }
	this.Add = function(p)
	{
		if (this.List.length >= this.Max)
			this.List.shift();

		p.z = p.z || 0; p.vz = p.vz || 0;
		p.age = 0;
		p.maxLife = p.life;
		p.size = p.size || 2;

		this.List.push(p);

		return p;
	}

	this.Clear = function()
	{
		this.List.length = 0;
	}

	// wind(x, y) -> [wx, wy] in px / s; solidAt(x, y) -> bool
	this.Step = function(dt, wind, solidAt)
	{
		var list = this.List, w = [0, 0];

		for (var i = list.length - 1; i >= 0; --i)
		{
			var p = list[i];

			p.age += dt;

			if (p.age >= p.life) { list.splice(i, 1); continue; }

			wind(p.x, p.y, w);

			var flying = p.z > 0.05 || p.vz > 1;
			var follow = (flying ? this.AirDrag : this.GroundDrag) * (p.light || 1) * dt;

			if (follow > 1) follow = 1;

			p.vx += (w[0] - p.vx) * follow;
			p.vy += (w[1] - p.vy) * follow;

			// height
			p.vz -= this.Gravity * dt;
			p.z += p.vz * dt;

			if (p.z <= 0)
			{
				p.z = 0;

				if (p.vz < -25)
					p.vz = -p.vz * this.Bounce;
				else
					p.vz = 0;
			}

			// plane motion, one axis at a time so a particle slides along walls
			var nx = p.x + p.vx * dt;

			if (solidAt(nx, p.y)) { p.vx = -p.vx * this.WallBounce; nx = p.x; }

			var ny = p.y + p.vy * dt;

			if (solidAt(nx, ny)) { p.vy = -p.vy * this.WallBounce; ny = p.y; }

			p.x = nx;
			p.y = ny;

			// a particle spawned (or pushed) into a solid tile is dropped instead of tunnelling around
			if (solidAt(p.x, p.y)) list.splice(i, 1);
		}
	}
}

if (typeof module !== 'undefined') module.exports = { ParticleSystem: ParticleSystem };
