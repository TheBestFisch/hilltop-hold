(() => {
  'use strict';

  const { Settings, i18n, Gallery } = Hold;

  const settings = new Settings();
  i18n.setLocale(settings.get('language'));
  settings.addEventListener('change', ({ detail }) => {
    if (detail.key === 'language') i18n.setLocale(detail.value);
  });

  // Exposed for console experiments and screenshot tooling.
  Hold.gallery = new Gallery({ canvas: document.getElementById('viewer'), settings });
})();
