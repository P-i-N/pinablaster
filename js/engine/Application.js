class Application {
	targetCanvas = null;
	targetCanvasContext = null;
	canvas = null;
	canvasContext = null;

	renderTime = 0;
	renderDelta = 0;
	time = 0;
	#remainingDelta = 0;
	delta = 0;
	overlays = [];

	/** @type {SpriteSheet} */
	sprites = null;

	/** @type {SpriteSheet} */
	font = null;

	/** @type {World} */
	world = null;

	/** @type {Array.<Controller>} */
	controllers = [];

	#onKeyDownFunc = (e) => this.#onKeyDown(e);
	#onKeyUpFunc = (e) => this.#onKeyUp(e);
	#onAnimationFrameFunc = (renderTime) => this.#render(renderTime);
	#onFocusFunc = () => this.#onFocus();
	#onBlurFunc = () => this.#onBlur();
	#onWindowResizeFunc = () => this.#onWindowResize();
	#onGamepadConnectedFunc = (e) => this.#onGamepadConnected(e);
	#onGamepadDisconnectedFunc = (e) => this.#onGamepadDisconnected(e);

	constructor(targetCanvas, canvasWidth, canvasHeight) {
		this.targetCanvas = targetCanvas;
		this.targetCanvasContext = targetCanvas.getContext("2d");
		this.canvasWidth = canvasWidth;
		this.canvasHeight = canvasHeight;

		this.canvas = document.createElement("canvas");
		this.canvas.width = canvasWidth;
		this.canvas.height = canvasHeight;
		this.canvasContext = this.canvas.getContext("2d");

		this.controllers = [];
		this.controllers.push(new KeyboardController());
	}

	start() {
		document.addEventListener("keydown", this.#onKeyDownFunc);
		document.addEventListener("keyup", this.#onKeyUpFunc);
		window.addEventListener("focus", this.#onFocusFunc);
		window.addEventListener("blur", this.#onBlurFunc);
		window.addEventListener("resize", this.#onWindowResizeFunc);
		window.addEventListener("gamepadconnected", this.#onGamepadConnectedFunc);
		window.addEventListener("gamepaddisconnected", this.#onGamepadDisconnectedFunc);
		window.requestAnimationFrame(this.#onAnimationFrameFunc);

		this.#onWindowResizeFunc();
	}

	stop() {
		document.removeEventListener("keydown", this.#onKeyDownFunc);
		document.removeEventListener("keyup", this.#onKeyUpFunc);
		window.removeEventListener("focus", this.#onFocusFunc);
		window.removeEventListener("blur", this.#onBlurFunc);
		window.removeEventListener("resize", this.#onWindowResizeFunc);
		window.removeEventListener("gamepadconnected", this.#onGamepadConnectedFunc);
		window.removeEventListener("gamepaddisconnected", this.#onGamepadDisconnectedFunc);
	}

	#onKeyDown(e) {
		// Prevent page scrolling
		if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) > -1)
			e.preventDefault();

		console.log(e);

		this.controllers.forEach(ctrl => {
			ctrl.onKeyDown(e.key);
		});
	}

	#onKeyUp(e) {
		this.controllers.forEach(ctrl => {
			ctrl.onKeyUp(e.key);
		});
	}

	#onFocus() {
		
	}

	#onBlur() {
		
	}

	#onWindowResize() {
		this.targetCanvas.width = window.innerWidth;
		this.targetCanvas.height = window.innerHeight;
	}

	#onGamepadConnected(e) {
		console.log("Gamepad connected!");
		console.log(e);
	}

	#onGamepadDisconnected(e) {
		console.log("Gamepad disconnected!");
		console.log(e);
	}

	#tick(delta) {
		this.delta = delta;
		
		if (this.overlays.length > 0) {
			let overlay = this.overlays[this.overlays.length - 1];
			overlay.tick(delta);
		}

		if (this.world)
			this.world.tick(delta);

		this.time += delta;
	}

	#render(renderTime) {
		this.renderDelta = renderTime - this.renderTime;
		this.renderTime = renderTime;

		// Clear canvas
		{
			let ctx = this.canvasContext;
			ctx.beginPath();
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		}

		const fixedStep = 16.666666;
		const deltaTolerance = 0.25;
		const maxTicksPerAnimFrame = 5;

		if (this.renderDelta <= fixedStep * maxTicksPerAnimFrame)
			this.#remainingDelta += this.renderDelta;
		else
			this.#remainingDelta += maxTicksPerAnimFrame * fixedStep;

		let numSteps = 0;
		while ((this.#remainingDelta + deltaTolerance) >= fixedStep) {
			this.#tick(fixedStep);
			this.#remainingDelta -= fixedStep;
			++numSteps;
		}

		if (Math.abs(this.#remainingDelta) <= deltaTolerance) {
			this.#remainingDelta = 0;
		}

		// Clear target canvas
		{
			let ctx = this.targetCanvasContext;
			ctx.beginPath();
			ctx.fillStyle = '#222';
			ctx.fillRect(0, 0, this.targetCanvas.width, this.targetCanvas.height);
		}

		if (this.world) {
			this.world.render(this.canvasContext, this.canvas.width / 2, this.canvas.height / 2);
		}

		if (this.overlays.length > 0) {
			let overlay = this.overlays[this.overlays.length - 1];
			overlay.render(this.canvasContext);
		}

		// Blit application canvas over target canvas
		{
			let ctx = this.targetCanvasContext;

			let scaleX = this.targetCanvas.width / this.canvas.width;
			let scaleY = this.targetCanvas.height / this.canvas.height;
			let scale = scaleX < scaleY ? scaleX : scaleY;
			
			let destWidth = this.canvas.width * scale;
			let destHeight = this.canvas.height * scale;

			let prevImageSmoothingEnabled = ctx.imageSmoothingEnabled;
			//ctx.imageSmoothingEnabled = false;

			ctx.drawImage(
				this.canvas,
				Math.floor((this.targetCanvas.width - destWidth) / 2),
				Math.floor((this.targetCanvas.height - destHeight) / 2),
				destWidth, destHeight);

			ctx.imageSmoothingEnabled = prevImageSmoothingEnabled;
		}

		window.requestAnimationFrame(this.#onAnimationFrameFunc);
	}

	/**
	 * @param {Overlay} overlay 
	 */
	pushOverlay(overlay) {
		overlay.application = this;
		this.overlays.push(overlay);
	}

	popOverlay() {
		if (this.overlays.length > 0) {
			this.overlays.pop();
		}
	}
}
