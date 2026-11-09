import base from './playwright.config.js';
export default { ...base, testIgnore: [], testMatch: ['**/ui-polish*.spec.js', '**/navigation-stability.spec.js', '**/owner-controls.spec.js', '**/gift-box-handoff.spec.js', '**/batch1-auth.spec.js', '**/admin-inbox.spec.js', '**/batch2-storefront.spec.js'],
  outputDir: './test-results/ui-polish',
  webServer: { ...base.webServer, env: { ...base.webServer.env, VITE_GIFT_BOX_BUILDER_ENABLED: 'true' } },
};
