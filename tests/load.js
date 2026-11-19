'use strict';

/**
 * Loads the game's plain scripts into an isolated context, the same way
 * index.html does, so the rules can be tested in Node without a browser.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadContext(files) {
  const context = {
    console, structuredClone, EventTarget, Event, CustomEvent,
    navigator: { language: 'en-US' },
    localStorage: { getItem: () => null, setItem() {} },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  }
  return context;
}

function loadScripts(files) {
  return loadContext(files).Hold;
}

/** Loads the data and simulation layer (no Three.js, no DOM). */
function loadSim() {
  return loadScripts([
    'src/namespace.js',
    'src/core/math.js',
    'src/core/TimeController.js',
    'src/data/map.js',
    'src/data/enemies.js',
    'src/data/towers.js',
    'src/data/waves.js',
    'src/data/village.js',
    'src/sim/path.js',
    'src/sim/World.js',
  ]);
}

/** Script paths listed in an HTML page, in load order. */
function scriptsOf(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
}

module.exports = { ROOT, loadContext, loadScripts, loadSim, scriptsOf };
