// Copyright 2012 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview The background page that loads & runs everything.  Try to keep
 * code in here minimal as this cannot be unittested.
 */

import {hterm} from './deps_local.concat.js';

import {browserAction, getSyncStorage, runtimeSendMessage} from './nassh.js';
import {App} from './nassh_app.js';
import {importPreferences} from './nassh_background.js';
import {addListeners as externalAddListeners,
        initApi} from './nassh_external_api.js';
import {migrateFilesystemFromDomToIndexeddb} from './nassh_fs.js';
import {probeExtensions} from './nassh_google.js';
import {SftpFsp} from './nassh_sftp_fsp.js';

let didLaunch = false;

/**
 * Mark the app as having been launched by the user before we were ready.
 */
function onLaunched() {
  didLaunch = true;
}

// We have to turn on listeners here so we can handle messages when first
// launched.
externalAddListeners();

// Used to watch for launch events that occur before we're ready to handle
// them.  We'll clean this up below during init.
if (browserAction) {
  browserAction.onClicked.addListener(onLaunched);
}

/**
 * Perform any required async initialization, then create our app instance.
 *
 * The window.app_ property will contain the new app instance so it can be
 * reached from the background page's JS console.
 */
function init() {
  const fsp = new SftpFsp();
  initApi(fsp);

  const storage = getSyncStorage();
  const app = new App(storage);

  // Register our context menus.
  app.installContextMenus();

  // If omnibox is enabled, set it up.
  if (globalThis.chrome?.omnibox) {
    app.installOmnibox(chrome.omnibox);
  }

  // Probe gnubby extensions.
  probeExtensions();

  // Bind the FSP APIs.
  fsp.addListeners();

  // If we're running as an extension, finish setup.
  if (browserAction) {
    browserAction.onClicked.removeListener(onLaunched);
    app.installBrowserAction();
  }

  // Migrate over the DOM filesystem to the new indexeddb-fs.
  migrateFilesystemFromDomToIndexeddb();

  // If the user tried to run us while we were initializing, run it now.
  if (didLaunch) {
    app.onLaunched();
  }

  // Help with live debugging.
  globalThis.app_ = app;
}

/**
 * Migrate from localStorage to chrome.storage.local.
 */
function migrateLocalPreferences() {
  if (globalThis.localStorage === undefined ||
      globalThis.chrome?.storage?.local === undefined) {
    // Migration only works when we have access to both APIs.
    return;
  }

  const prefs = {};
  for (const key in globalThis.localStorage) {
    if (!key.startsWith('/nassh/')) {
      continue;
    }

    try {
      prefs[key] = JSON.parse(globalThis.localStorage[key]);
    } catch (e) { /**/ }
    globalThis.localStorage.removeItem(key);
  }
  chrome.storage.local.set(prefs);
}

/**
 * Sync prefs between versions automatically.
 *
 * This helps when installing the dev version the first time, or migrating from
 * the Chrome App variant to the standard extension.
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`onInstalled fired due to "${details.reason}"`);

  migrateLocalPreferences();

  // Only sync prefs when installed the first time.
  if (details.reason != 'install') {
    return;
  }

  // We'll get called when logging into a new device for the first time when we
  // get installed automatically as part of the overall sync.  We'll have prefs
  // in that case already, so no need to sync.
  const commonPref = '/nassh/profile-ids';
  chrome.storage.sync.get([commonPref], (items) => {
    // Prefs exist, so exit early.
    if (commonPref in items) {
      return;
    }

    const appStableId = 'pnhechapfaindjhompbnflcldabbghjo';
    const appDevId = 'okddffdblfhhnmhodogpojmfkjmhinfp';
    const extStableId = 'iodihamcpbpeioajjeobimgagajmlibd';
    const extDevId = 'algkcnfjnajfhgimadimbjhmpaeohhln';

    /**
     * Try to import prefs from another install into our own.
     *
     * @param {string} srcId The extension to import from.
     * @param {function()=} onError Callback if extension doesn't exist.
     */
    const migrate = (srcId, onError = () => {}) => {
      console.log(`Trying to sync prefs from ${srcId}`);
      runtimeSendMessage(srcId, {command: 'prefsExport'})
        .then((response) => {
          const {prefs} = response;
          return importPreferences(prefs);
        })
        .catch(onError);
    };

    switch (chrome.runtime.id) {
      case appDevId:
      case extStableId:
        // Sync from stable app.
        migrate(appStableId);
        break;

      case extDevId:
        // Sync from stable ext then stable app then dev app.
        migrate(extStableId, () => {
          migrate(appStableId, () => {
            migrate(appDevId);
          });
        });
        break;
    }
  });
});

// Initialize the page!
hterm.initPromise.then(init);
