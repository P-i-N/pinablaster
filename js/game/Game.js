class Game extends Application {
	constructor(canvas) {
		super(canvas, 1920, 1080)
		
		this.sprites = new SpriteSheet("graphics/SpriteSheet.png", 17, 17, 23, 23);
		this.font = new SpriteSheet("graphics/C64Font.png", 8, 8);
		this.font.glyphs = this.sprites;
		this.font.chars =
			"@abcdefghijklmno" +
			"pqrstuvwxyz[ ]  " +
			" !\"#$%&'()*+,-./" +
			"0123456789:;<=>?" +
			" ABCDEFGHIJKLMNO" +
			"PQRSTUVWXYZ     ";

		this.players = [];
		this.world = new World(this.sprites, 4);
		this.initWorldFromLevelIndex(0);

		this.pushOverlay(new MainMenu());
	}

	initWorldFromString(lines) {
		if (!(lines instanceof Array))
			return;
		
		if (lines.length == 0)
			return;

		this.world.init(lines[0].length, lines.length);
		this.world.baseSpriteIndex = 20 * 4;

		for (let y = 0; y < lines.length; ++y) {
			for (let x = 0; x < lines[y].length; ++x) {
				let ch = lines[y][x];
				let spriteIndex = "0123456789".indexOf(ch);
				if (spriteIndex >= 0) {
					this.world.blocks[x][y] = spriteIndex;
					this.world.colliders[x][y] = true;
				}
				else
					this.world.blocks[x][y] = 20;

				let newEntity = null;

				// Player entity
				if ("PQRST".indexOf(ch) >= 0) {
					newEntity = new Player(0);
					newEntity.sprite = new Sprite(this.sprites);
					newEntity.controller = this.controllers[0];
				}

				if (newEntity) {
					newEntity.x = x * this.sprites.spriteWidth;
					newEntity.y = y * this.sprites.spriteHeight;
					newEntity.width = this.sprites.spriteWidth - 0;
					newEntity.height = this.sprites.spriteHeight - 0;
					this.world.addEntity(newEntity);
				}
			}
		}
	}

	initWorldFromLevelIndex(levelIndex) {
		switch (levelIndex) {
			case 0: {
				this.initWorldFromString([
					"200000000000000000000000002",
					"0          111            0",
					"0           1  1          0",
					"0     P 1 1   11          0",
					"0           1  1          0",
					"0          111            0",
					"0           1             0",
					"0                         0",
					"0                         0",
					"0                         0",
					"0                         0",
					"0                         0",
					"0                         0",
					"0                         0",
					"200000000000000000000000002"
				]);
			}
			break;
		}
	}
}
