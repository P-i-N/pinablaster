class Controller {
	dpad = [false, false, false, false];
	button = [false, false, false, false];

	constructor() {

	}

	onKeyDown(key) {

	}

	onKeyUp(key) {

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
	}

	onKeyUp(key) {
		let dpadIndex = this.dpadKeys.indexOf(key);
		if (dpadIndex >= 0)
			this.dpad[dpadIndex] = false;

		let buttonIndex = this.buttonKeys.indexOf(key);
		if (buttonIndex >= 0)
			this.button[buttonIndex] = false;
	}
}
