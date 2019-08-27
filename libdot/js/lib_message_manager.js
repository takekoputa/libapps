// Copyright (c) 2012 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * MessageManager class handles internationalized strings.
 *
 * Note: chrome.i18n isn't sufficient because...
 *     1. There's a bug in chrome that makes it unavailable in iframes:
 *        https://crbug.com/130200
 *     2. The client code may not be packaged in a Chrome extension.
 *     3. The client code may be part of a library packaged in a third-party
 *        Chrome extension.
 *
 * @param {!Array<string>} languages List of languages to load, in the order
 *     they should be loaded.  Newer messages replace older ones.  'en' is
 *     automatically added as the first language if it is not already present.
 */
lib.MessageManager = function(languages) {
  this.languages_ = languages.map((el) => el.replace(/-/g, '_'));

  if (this.languages_.indexOf('en') == -1)
    this.languages_.unshift('en');

  this.messages = {};
};

/**
 * Add message definitions to the message manager.
 *
 * This takes an object of the same format of a Chrome messages.json file.  See
 * <https://developer.chrome.com/extensions/i18n-messages>.
 *
 * @param {!Object} defs The message to add to the database.
 */
lib.MessageManager.prototype.addMessages = function(defs) {
  for (var key in defs) {
    var def = defs[key];

    if (!def.placeholders) {
      this.messages[key] = def.message;
    } else {
      // Replace "$NAME$" placeholders with "$1", etc.
      this.messages[key] = def.message.replace(
          /\$([a-z][^\s\$]+)\$/ig,
          function(m, name) {
            return defs[key].placeholders[name.toLowerCase()].content;
          });
    }
  }
};

/**
 * Load the first available language message bundle.
 *
 * @param {string} pattern A url pattern containing a "$1" where the locale
 *     name should go.
 * @param {function(!Array<string>, !Array<string>)} onComplete Function to be
 *     called when loading is complete.  The two arrays are the list of
 *     successful and failed locale names.  If the first parameter is length 0,
 *     no locales were loaded.
 */
lib.MessageManager.prototype.findAndLoadMessages = function(
    pattern, onComplete) {
  var languages = this.languages_.concat();
  var loaded = [];
  var failed = [];

  function onLanguageComplete(state) {
    if (state) {
      loaded = languages.shift();
    } else {
      failed = languages.shift();
    }

    if (languages.length) {
      tryNextLanguage();
    } else {
      onComplete(loaded, failed);
    }
  }

  var tryNextLanguage = function() {
    this.loadMessages(this.replaceReferences(pattern, languages),
                      onLanguageComplete.bind(this, true),
                      onLanguageComplete.bind(this, false));
  }.bind(this);

  tryNextLanguage();
};

/**
 * Load messages from a messages.json file.
 *
 * @param {string} url The URL to load the messages from.
 * @param {function()} onSuccess Callback when loading is successful.
 * @param {function()=} opt_onError Callback when any error is hit.
 */
lib.MessageManager.prototype.loadMessages = function(
    url, onSuccess, opt_onError) {
  var xhr = new XMLHttpRequest();

  xhr.onload = () => {
    this.addMessages(JSON.parse(xhr.responseText));
    onSuccess();
  };
  if (opt_onError)
    xhr.onerror = () => opt_onError(xhr);

  xhr.open('GET', url);
  xhr.send();
};

/**
 * Per-instance copy of replaceReferences.
 */
lib.MessageManager.prototype.replaceReferences = lib.i18n.replaceReferences;

/**
 * Get a message by name, optionally replacing arguments too.
 *
 * @param {string} msgname String containing the name of the message to get.
 * @param {!Array<string>=} opt_args Optional array containing the argument
 *     values.
 * @param {string=} opt_default Optional value to return if the msgname is not
 *     found.  Returns the message name by default.
 * @return {string} The formatted translation.
 */
lib.MessageManager.prototype.get = function(msgname, opt_args, opt_default) {
  // First try the integrated browser getMessage.  We prefer that over any
  // registered messages as only the browser supports translations.
  let message = lib.i18n.getMessage(msgname, opt_args);
  if (message)
    return message;

  // Look it up in the registered cache next.
  message = this.messages[msgname];
  if (!message) {
    console.warn('Unknown message: ' + msgname);
    message = opt_default === undefined ? msgname : opt_default;
    // Register the message with the default to avoid multiple warnings.
    this.messages[msgname] = message;
  }

  return this.replaceReferences(message, opt_args);
};

/**
 * Process all of the "i18n" html attributes found in a given dom fragment.
 *
 * The real work happens in processI18nAttribute.
 *
 * @param {!Document} dom The DOM whose nodes will be translated.
 */
lib.MessageManager.prototype.processI18nAttributes = function(dom) {
  var nodes = dom.querySelectorAll('[i18n]');

  for (var i = 0; i < nodes.length; i++)
    this.processI18nAttribute(nodes[i]);
};

/**
 * Process the "i18n" attribute in the specified node.
 *
 * The i18n attribute should contain a JSON object.  The keys are taken to
 * be attribute names, and the values are message names.
 *
 * If the JSON object has a "_" (underscore) key, its value is used as the
 * textContent of the element.
 *
 * Message names can refer to other attributes on the same element with by
 * prefixing with a dollar sign.  For example...
 *
 *   <button id='send-button'
 *           i18n='{"aria-label": "$id", "_": "SEND_BUTTON_LABEL"}'
 *           ></button>
 *
 * The aria-label message name will be computed as "SEND_BUTTON_ARIA_LABEL".
 * Notice that the "id" attribute was appended to the target attribute, and
 * the result converted to UPPER_AND_UNDER style.
 *
 * @param {!Element} node The element to translate.
 */
lib.MessageManager.prototype.processI18nAttribute = function(node) {
  // Convert the "lower-and-dashes" attribute names into
  // "UPPER_AND_UNDER" style.
  const thunk = (str) => str.replace(/-/g, '_').toUpperCase();

  var i18n = node.getAttribute('i18n');
  if (!i18n)
    return;

  try {
    i18n = JSON.parse(i18n);
  } catch (ex) {
    console.error('Can\'t parse ' + node.tagName + '#' + node.id + ': ' + i18n);
    throw ex;
  }

  // Load all the messages specified in the i18n attributes.
  for (var key in i18n) {
    // The node attribute we'll be setting.
    var attr = key;

    var msgname = i18n[key];
    // For "=foo", re-use the referenced message name.
    if (msgname.startsWith('=')) {
      key = msgname.substr(1);
      msgname = i18n[key];
    }

    // For "$foo", calculate the message name.
    if (msgname.startsWith('$'))
      msgname = thunk(node.getAttribute(msgname.substr(1)) + '_' + key);

    // Finally load the message.
    var msg = this.get(msgname);
    if (attr == '_')
      node.textContent = msg;
    else
      node.setAttribute(attr, msg);
  }
};
