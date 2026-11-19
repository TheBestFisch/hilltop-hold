/**
 * Shared namespace for the game's scripts. Plain scripts (rather than ES modules)
 * let index.html run straight from disk, since browsers block modules on file://.
 * Each script reads its dependencies from here and registers its own exports.
 */
window.Hold = { locales: {} };
