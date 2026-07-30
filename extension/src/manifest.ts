import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'SightAgent',
  description: 'An open-source visual AI agent that monitors user actions and provides intelligent analysis.',
  version: '0.1.0',

  permissions: [
    'activeTab',
    'offscreen',
    'storage',
    'alarms',
    'sidePanel',
    'tabs',
  ],

  host_permissions: ['<all_urls>'],

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],

  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },

  icons: {
    '16': 'public/icon-16.png',
    '48': 'public/icon-48.png',
    '128': 'public/icon-128.png',
  },

  action: {
    default_title: 'SightAgent',
    default_icon: {
      '16': 'public/icon-16.png',
      '48': 'public/icon-48.png',
      '128': 'public/icon-128.png',
    },
  },
});
