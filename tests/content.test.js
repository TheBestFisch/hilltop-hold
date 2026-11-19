'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadScripts, scriptsOf } = require('./load');

function keysOf(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    (value && typeof value === 'object' ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]));
}

test('every language has exactly the same text keys as English', () => {
  const Hold = loadScripts(['src/namespace.js', 'src/i18n/locales/en.js', 'src/i18n/locales/de.js', 'src/i18n/locales/ro.js']);
  const english = keysOf(Hold.locales.en).sort();
  for (const [code, locale] of Object.entries(Hold.locales)) {
    assert.deepEqual(keysOf(locale).sort(), english, `locale "${code}" differs from English`);
  }
});

test('every script in index.html and gallery.html exists, and every source file is loaded by one of them', () => {
  const game = scriptsOf('index.html');
  const gallery = scriptsOf('gallery.html');
  const referenced = new Set([...game, ...gallery]);
  for (const script of referenced) assert.ok(fs.existsSync(path.join(ROOT, script)), `missing ${script}`);
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : entry.name.endsWith('.js') ? [`${dir}/${entry.name}`] : []));
  for (const source of walk('src')) assert.ok(referenced.has(source), `${source} is not loaded by index.html or gallery.html`);
  // The gallery must load the shared scripts in the same dependency order as the game.
  const shared = gallery.filter((script) => game.includes(script));
  assert.deepEqual(shared, game.filter((script) => gallery.includes(script)), 'gallery.html loads shared scripts in a different order');
  assert.ok(gallery.some((script) => script.endsWith('models/catalog.js')), 'the gallery must load the catalog');
});

test('every model in the catalog builds, is described, and towers and invaders expose their parts', () => {
  const scripts = scriptsOf('index.html').filter((script) => /vendor|namespace|core\/math|data\/|sim\/|models\//.test(script));
  const Hold = loadScripts(scripts);
  const { en } = loadScripts(['src/namespace.js', 'src/i18n/locales/en.js']).locales;
  const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], en);
  const ids = new Set();
  for (const entry of Hold.catalog.entries) {
    assert.ok(!ids.has(entry.id), `duplicate model id ${entry.id}`);
    ids.add(entry.id);
    assert.ok(Hold.catalog.groups.includes(entry.group), `${entry.id} has unknown group ${entry.group}`);
    assert.equal(typeof lookup(entry.label), 'string', `${entry.id} label ${entry.label} has no English text`);
    if (entry.variantLabel) assert.equal(typeof lookup(entry.variantLabel), 'string', `${entry.id} variant label missing`);
    const model = entry.build();
    let meshes = 0;
    model.traverse((node) => { if (node.isMesh) meshes++; });
    assert.ok(meshes > 0, `${entry.id} has no meshes`);
    if (entry.group === 'tower') {
      assert.ok(model.userData.turret, `${entry.id} has no turret`);
      assert.ok(Array.isArray(model.userData.muzzle), `${entry.id} has no muzzle`);
    }
    if (entry.group === 'enemy') {
      assert.ok(model.userData.body, `${entry.id} has no body`);
      assert.ok(model.userData.height > 0, `${entry.id} has no height for its health bar`);
    }
  }
  assert.ok(Hold.catalog.series('tower:archer').length === 3);
});

test('every tower, enemy and toast used by the game has text', () => {
  const Hold = loadScripts([
    'src/namespace.js', 'src/i18n/locales/en.js', 'src/core/math.js',
    'src/data/enemies.js', 'src/data/towers.js',
  ]);
  const { en } = Hold.locales;
  for (const tower of Hold.TOWERS) assert.ok(en.towers[tower.id]?.name, `missing name for tower ${tower.id}`);
  for (const type of Object.keys(Hold.ENEMIES)) assert.ok(en.enemies[type], `missing name for enemy ${type}`);
  for (const reason of ['noGold', 'blocked', 'maxed']) assert.ok(en.toast[reason], `missing toast ${reason}`);
});
