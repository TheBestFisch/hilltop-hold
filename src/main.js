(() => {
  'use strict';

  const { Settings, i18n, Game } = Hold;

  const settings = new Settings();
  i18n.setLocale(settings.get('language'));
  settings.addEventListener('change', ({ detail }) => {
    if (detail.key === 'language') i18n.setLocale(detail.value);
  });

  // Exposed for console experiments and screenshot tooling.
  Hold.game = new Game({ canvas: document.getElementById('scene'), settings });
  Hold.game.start();
})();
