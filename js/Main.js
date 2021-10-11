/** @type {Game} */
let game = null;

function debugPrint(text) {
	game.debugStrings.push(text);
}

(function() {
	game = new Game(document.getElementById("mainCanvas"));
	game.start();
})();
