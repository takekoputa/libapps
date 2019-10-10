// Copyright 2019 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview Terminal Settings Checkbox Polymer Element unit tests.
 */

import {TerminalSettingsCheckboxElement} from './terminal_settings_checkbox.js';

describe('terminal_settings_checkbox_tests.js', () => {
  const preference = 'terminal_settings_checkbox_tests_preference';

  before(function() {
    if (customElements.get(TerminalSettingsCheckboxElement.is) === undefined) {
      customElements.define(
          TerminalSettingsCheckboxElement.is,
          TerminalSettingsCheckboxElement);
    }
  });

  beforeEach(function() {
    window.preferenceManager =
      new lib.PreferenceManager(new lib.Storage.Memory());
    window.preferenceManager.definePreference(preference, false);

    this.el = document.createElement('terminal-settings-checkbox');
    this.el.setAttribute('description', 'test element');
    this.el.setAttribute('preference', preference);
    document.body.appendChild(this.el);
  });

  afterEach(function() {
    document.body.removeChild(this.el);

    delete window.preferenceManager;
  });

  it('updates-ui-when-preference-changes', async function() {
    assert.isFalse(window.preferenceManager.get(preference));
    assert.isFalse(this.el.shadowRoot.getElementById('checkbox').checked);

    await window.preferenceManager.set(preference, true);
    assert.isTrue(this.el.shadowRoot.getElementById('checkbox').checked);

    await window.preferenceManager.set(preference, false);
    assert.isFalse(this.el.shadowRoot.getElementById('checkbox').checked);
  });

  it('updates-preference-when-ui-changes', async function() {
    assert.isFalse(window.preferenceManager.get(preference));
    assert.isFalse(this.el.shadowRoot.getElementById('checkbox').checked);

    this.el.shadowRoot.getElementById('checkbox').click();
    await lib.waitUntil(() => this.el.isConsistent());
    assert.isTrue(window.preferenceManager.get(preference));

    this.el.shadowRoot.getElementById('checkbox').click();
    await lib.waitUntil(() => this.el.isConsistent());
    assert.isFalse(window.preferenceManager.get(preference));
  });
});