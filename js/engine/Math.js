function clamp(value, min, max) {
	if (value < min)
		return min;
	else if (value > max)
		return max;

	return value;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class Point {
	x = 0;
	y = 0;

	constructor(px = 0, py = 0) {
		this.x = 0;
		this.y = 0;
	}

	clone() {
		return new Point(x, y);
	}

	length2() {
		return this.x * this.x + this.y * this.y;
	}

	length() {
		return Math.sqrt(this.length2());
	}

	normalize() {
		let len = length2();
		if (len > 0) {
			len = Math.sqrt(len);
			this.x /= len;
			this.y /= len;
		}

		return len;
	}
}

class Hit {
	pos = new Point();
	delta = new Point();
	time = 0;

	constructor() {
	}
}

class Sweep {
	hit = new Hit();
	pos = new Point();
	time = 0;
}

class AABB {
	pos = new Point();
	half = new Point();

	constructor(p, h) {
		this.pos = p;
		this.half = h;
	}

	clone() {
		return new AABB(this.pos.clone(), this.half.clone());
	}

	intersectPoint(p) {
		let dx = p.x - this.pos.x;
		let px = this.half.x - Math.abs(dx);
		if (px <= 0)
			return null;

		let dy = p.y - this.pos.y;
		let py = this.half.y - Math.abs(dy);
		if (py <= 0)
			return null;

		let hit = new Hit();
		if (px < py) {
			let sx = Math.sign(dx);
			hit.delta.x = px * sx;
			hit.normal.x = sx;
			hit.pos.x = this.pos.x + (this.hals.x * sx);
			hit.pos.y = p.y;
		}
		else {
			let sy = Math.sign(dy);
			hit.delta.y = py * sy;
			hit.normal.y = sy;
			hit.pos.x = p.x;
			hit.pos.y = this.pos.y + (this.hals.y * sy);
		}

		return hit;
	}

	intersectSegment(pos, delta, paddingX = 0, paddingY = 0) {
		const scaleX = 1.0 / delta.x;
		const scaleY = 1.0 / delta.y;
		const signX = Math.sign(scaleX);
		const signY = Math.sign(scaleY);
		const nearTimeX = (this.pos.x - signX * (this.half.x + paddingX) - pos.x) * scaleX;
		const nearTimeY = (this.pos.y - signY * (this.half.y + paddingY) - pos.y) * scaleY;
		const farTimeX = (this.pos.x + signX * (this.half.x + paddingX) - pos.x) * scaleX;
		const farTimeY = (this.pos.y + signY * (this.half.y + paddingY) - pos.y) * scaleY;

		if (nearTimeX > farTimeY || nearTimeY > farTimeX)
			return null;

		const nearTime = nearTimeX > nearTimeY ? nearTimeX : nearTimeY;
		const farTime = farTimeX < farTimeY ? farTimeX : farTimeY;

		if (nearTime >= 1 || farTime <= 0)
			return null;

		const hit = new Hit();
		
		hit.time = clamp(nearTime, 0, 1);
		
		if (nearTimeX > nearTimeY) {
			hit.normal.x = -signX;
			hit.normal.y = 0;
		} else {
			hit.normal.x = 0;
			hit.normal.y = -signY;
		}

		hit.delta.x = (1.0 - hit.time) * -delta.x;
		hit.delta.y = (1.0 - hit.time) * -delta.y;
		hit.pos.x = pos.x + delta.x * hit.time;
		hit.pos.y = pos.y + delta.y * hit.time;

		return hit;
	}

	intersectAABB(box) {
		const dx = box.pos.x - this.pos.x;
		const px = (box.half.x + this.half.x) - Math.abs(dx);
		if (px <= 0)
			return null;

		const dy = box.pos.y - this.pos.y;
		const py = (box.half.y + this.half.y) - Math.abs(dy);
		if (py <= 0)
			return null;
		
		let hit = new Hit();
		if (px < py) {
			const sx = Math.sign(dx);
			hit.delta.x = px * sx;
			hit.normal.x = sx;
			hit.pos.x = this.pos.x + (this.half.x * sx);
			hit.pos.y = box.pos.y;
		}
		else {
			const sy = Math.sign(dy);
			hit.delta.y = py * sy;
			hit.normal.y = sy;
			hit.pos.x = box.pos.x;
			hit.pos.y = this.pos.y + (this.half.y * sy);
		}

		return hit;
	}

	sweepAABB(box, delta) {
		let sweep = new Sweep();
		if (delta.x === 0 && delta.y === 0) {
			sweep.pos.x = box.pos.x;
			sweep.pos.y = box.pos.y;
			sweep.hit = this.intersectAABB(box);
			sweep.time = sweep.hit ? (sweep.hit.time = 0) : 1;
			return sweep;
		}

		sweep.hit = this.intersectSegment(box.pos, delta, box.half.x, box.half.y);
		if (sweep.hit) {
			sweep.time = clamp(sweep.hit.time - 0.001, 0, 1);
			sweep.pos.x = box.pos.x + delta.x * sweep.time;
			sweep.pos.y = box.pos.y + delta.y * sweep.time;
			
			const direction = delta.clone();
			direction.normalize();
			
			sweep.hit.pos.x = clamp(
				sweep.hit.pos.x + direction.x * box.half.x,
				this.pos.x - this.half.x, this.pos.x + this.half.x);
			sweep.hit.pos.y = clamp(
				sweep.hit.pos.y + direction.y * box.half.y,
				this.pos.y - this.half.y, this.pos.y + this.half.y);
		}
		else {
			sweep.pos.x = box.pos.x + delta.x;
			sweep.pos.y = box.pos.y + delta.y;
			sweep.time = 1;
		}

		return sweep;
	}
}
