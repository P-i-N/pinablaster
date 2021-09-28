class MainMenu extends Overlay {
	constructor() {
		super();
	}

	tick(delta) {
		
	}

	render(ctx) {
		let f = this.application.font;
		f.print(ctx, 0, 0, "Hello! {0;0}", 2);
	}
}
