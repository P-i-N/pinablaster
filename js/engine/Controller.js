class Controller {
	// Up, Right, Down, Left
	dpad = [false, false, false, false];

	// A, B, X, Y
	button = [false, false, false, false];

	// 0 = no direction
	// 1 = up, 2 = up+right, 3 = right, 4 = down+right
	// 5 = down, 6 = down+left, 7 = left, 8 = up+left
	direction = 0;

	constructor() {

	}

	onKeyDown(key) {

	}

	onKeyUp(key) {

	}

	static determineDirection(up, right, down, left) {
		let bits = 0;

		bits += up ? 1 : 0;
		bits += right ? 2 : 0;
		bits += down ? 4 : 0;
		bits += left ? 8 : 0;

		switch (bits) {
			case  1: return 1; break;
			case  2: return 3; break;
			case  3: return 2; break;
			case  4: return 5; break;
			case  6: return 4; break;
			case  8: return 7; break;
			case  9: return 8; break;
			case 12: return 6; break;
		}

		return 0;
	}

	getDirection() {
		return Controller.determineDirection(
			this.dpad[0], this.dpad[1], this.dpad[2], this.dpad[3]
		);
	}
}

///////////////////////////////////////////////////////////////////////////////

class KeyboardController extends Controller {
	dpadKeys = [ "ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft" ];
	buttonKeys = [ "Space" ];

	constructor() {
		super();
	}

	onKeyDown(key) {
		let dpadIndex = this.dpadKeys.indexOf(key);
		if (dpadIndex >= 0)
			this.dpad[dpadIndex] = true;

		let buttonIndex = this.buttonKeys.indexOf(key);
		if (buttonIndex >= 0)
		this.button[buttonIndex] = true;

		this.direction = this.getDirection();
	}

	onKeyUp(key) {
		let dpadIndex = this.dpadKeys.indexOf(key);
		if (dpadIndex >= 0)
			this.dpad[dpadIndex] = false;

		let buttonIndex = this.buttonKeys.indexOf(key);
		if (buttonIndex >= 0)
			this.button[buttonIndex] = false;

		this.direction = this.getDirection();
	}
}
