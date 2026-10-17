const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map(m => m[1]);

test('every referenced script exists and appears once', () => {
  scripts.forEach(s => assert.ok(fs.existsSync(path.join(root, s)), 'missing ' + s));
  assert.strictEqual(new Set(scripts).size, scripts.length);
});

test('no jQuery and no <audio> tags remain', () => {
  assert.ok(!scripts.some(s => /jquery/i.test(s)));
  assert.ok(!/<audio/i.test(html));
});

test('load order: constructors that need earlier files', () => {
  const at = (s) => { const i = scripts.indexOf(s); assert.ok(i >= 0, s + ' not loaded'); return i; };
  const engine = at('Engine/Engine.js');
  ['Engine/Renderer.js', 'Engine/Display.js', 'Engine/GameWorld.js', 'Engine/GameEntityManager.js'].forEach(s => assert.ok(at(s) > engine, s + ' must load after Engine.js'));
  assert.ok(at('Library/Utils.js') < engine);
  assert.ok(at('Engine/Loop.js') < engine);
  assert.ok(at('Engine/GameEntity.js') < at('Game/Player.js'));
  assert.ok(at('Game/Players.js') < at('Game/Player.js'));
  assert.ok(at('Game/AiBrain.js') < at('Game/PiNaBlaster.js'));
  assert.ok(at('Game/AiWorld.js') < at('Game/AiBrain.js'));
  assert.ok(at('Engine/Turbo.js') < engine);
  assert.ok(at('Game/Sim.js') > at('Game/PiNaBlaster.js'));
  assert.ok(at('Game/Screens.js') < at('Game/Lobby.js'));
  assert.ok(at('Game/Lobby.js') < at('Game/Lan.js'));
  assert.ok(at('Net/Snapshot.js') < at('Game/NetGame.js'));
  assert.ok(at('Net/RemoteInput.js') < at('Game/NetGame.js'));
  assert.ok(at('Game/NetGame.js') < at('Game/PiNaBlaster.js'));
  assert.ok(at('Game/Levels.js') < at('Game/PiNaBlaster.js'));
  assert.ok(at('Engine/Input.js') < at('Engine/TouchControls.js'));
  assert.ok(at('Engine/TouchControls.js') < at('Game/Settings.js'));
  assert.ok(at('Game/PiNaBlaster.js') < at('Main.js'));
});

test('canvas is the 16:9 virtual size', () => {
  assert.ok(/<canvas id="mainCanvas" width="576" height="324"/.test(html));
});
