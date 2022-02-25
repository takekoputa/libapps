// Copyright 2021 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import {DEFAULT_VM_NAME, DEFAULT_CONTAINER_NAME, ORIGINAL_URL, TMUX_PARAM_NAME}
    from './terminal_common.js';

/**
 * @typedef {{
 *  vmName: (string|undefined),
 *  containerName: (string|undefined),
 * }}
 */
export let ContainerId;

/**
 * @typedef {{
 *   windowChannelName: (string|undefined),
 *   driverChannelName: string,
 * }}
 */
export let TmuxLaunchInfo;

/**
 * - The `containerId` should be canonicalized such that empty container id is
 *   converted to one with the default vm name and container name.
 * - `hasCwd` indicates whether there is a cwd argument in `args`.
 * - `terminalId` is not set initially. It should be set when we get it from
 *   chrome.terminalPrivate.openVmShellProcess().
 *
 * @typedef {{
 *   args: !Array<string>,
 *   containerId: !ContainerId,
 *   hasCwd: boolean,
 *   terminalId: (string|undefined),
 * }}
 */
export let VshLaunchInfo;

/**
 * @typedef {{
 *   needRedirect: boolean,
 * }}
 */
export let SSHLaunchInfo;

/**
 * Only one of the top level properties should exist.
 *
 * @typedef {{
 *   tmux: (!TmuxLaunchInfo|undefined),
 *   vsh: (!VshLaunchInfo|undefined),
 *   crosh: (!Object|undefined),
 *   ssh: (!SSHLaunchInfo|undefined),
 * }}
 */
export let LaunchInfo;

/**
 * @typedef {{
 *   tabId: number,
 *   title: string,
 *   launchInfo: !LaunchInfo,
 * }}
 */
export let TerminalInfo;

/**
 * TerminalInfoTracker tracks the TerminalInfo for the current tab. It also
 * communicates with other terminal tabs via a common BroadcastChannel. There
 * are only two types of messages, and the data types are different:
 *
 * - Data is a tab id (i.e. number): This is requesting the tab's TerminalInfo.
 * - Data is a TerminalInfo object. This is usually sent in response to a
 *   request.
 */
export class TerminalInfoTracker {
  /**
   * Normal users should use create() instead of the constructor directly.
   *
   * @param {{
   *   tabId: number,
   *   channel: !BroadcastChannel,
   *   launchInfo: !LaunchInfo,
   *   parentTitle: (string|undefined),
   * }} args
   */
  constructor({tabId, channel, launchInfo, parentTitle}) {
    this.tabId_ = tabId;
    this.channel_ = channel;
    this.launchInfo_ = launchInfo;
    this.parentTitle_ = parentTitle;

    this.channel_.onmessage = (ev) => {
      if (ev.data === this.tabId_) {
        // Respond to a request.
        this.postInfo_();
      }
    };
    // Post once immedately since we might miss requests before the channel is
    // set up.
    this.postInfo_();
  }

  /**
   * Create a new TerminalInfoTracker.
   *
   * @return {!Promise<!TerminalInfoTracker>}
   */
  static async create() {
    return new Promise((resolve) => {
      chrome.tabs.getCurrent((tab) => {
        (async () => {
          const channel = new BroadcastChannel('terminalInfoTracker');
          const parentTerminalInfo =
              await TerminalInfoTracker.requestTerminalInfo(channel,
                  tab.openerTabId);
          resolve(new TerminalInfoTracker({
            tabId: tab.id,
            channel,
            launchInfo: resolveLaunchInfo(parentTerminalInfo?.launchInfo),
            parentTitle: parentTerminalInfo?.title,
          }));
        })();
      });
    });
  }

  /** @return {number} */
  get tabId() {
    return this.tabId_;
  }

  /** @return {!LaunchInfo} */
  get launchInfo() {
    return this.launchInfo_;
  }

  /** @return {string|undefined} */
  get parentTitle() {
    return this.parentTitle_;
  }

  postInfo_() {
    this.channel_.postMessage({
      tabId: this.tabId_,
      title: document.title,
      launchInfo: this.launchInfo_,
    });
  }

  /**
   * Send a request for the TerminalInfo on the channel. Note that
   * `channel.onmessage` is always overwritten here.
   *
   * @param {!BroadcastChannel} channel
   * @param {?number} tabId
   * @param {number=} timeout
   * @return {!Promise<?TerminalInfo>} Resolve to null if there is no response.
   */
  static async requestTerminalInfo(channel, tabId, timeout = 1000) {
    /** @type {?TerminalInfo} */
    let terminalInfo = null;

    if (tabId !== undefined && tabId !== null) {
      terminalInfo = await new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          console.warn(`timeout waiting for terminal info (tabId=${tabId})`);
          resolve(null);
          channel.onmessage = null;
        }, timeout);

        channel.onmessage = (ev) => {
          if (typeof ev.data === 'object' && ev.data.tabId === tabId) {
            resolve(ev.data);
            clearTimeout(timeoutId);
          }
        };

        channel.postMessage(tabId);
      });
    }

    channel.onmessage = null;
    return terminalInfo;
  }

}

let terminalInfoTrackerPromise = null;

/**
 * Get the global TerminalInfoTracker.
 *
 * @return {!Promise<!TerminalInfoTracker>}
 */
export async function getTerminalInfoTracker() {
  if (!terminalInfoTrackerPromise) {
    terminalInfoTrackerPromise = TerminalInfoTracker.create();
  }
  return terminalInfoTrackerPromise;
}

/**
 * This figures out and returns the terminal launch info for the current tab.
 *
 * @param {!LaunchInfo|undefined} parentLaunchInfo
 * @param {!URL=} url The url of the tab. This is for testing.
 *     Normal user should just use the default value.
 * @return {!LaunchInfo}
 */
export function resolveLaunchInfo(parentLaunchInfo, url = ORIGINAL_URL) {
  if (url.host === 'crosh') {
    return {crosh: {}};
  }

  if (url.pathname === '/html/terminal_ssh.html') {
    return {ssh: {needRedirect: false}};
  }

  // We only follow parentLaunchInfo if there is no search params. (The default
  // url does not have search param.)
  if (!url.search && parentLaunchInfo) {
    if (parentLaunchInfo.ssh) {
      return {ssh: {needRedirect: true}};
    }

    if (parentLaunchInfo.tmux) {
      return {tmux: {
        driverChannelName: parentLaunchInfo.tmux.driverChannelName,
      }};
    }
  }

  if (url.searchParams.has(TMUX_PARAM_NAME)) {
    return {tmux: /** @type {!TmuxLaunchInfo} */(JSON.parse(
        /** @type {string} */(url.searchParams.get(TMUX_PARAM_NAME))))};
  }

  const args = url.searchParams.getAll('args[]');
  const outputArgs = [];
  let containerId = {};
  let inputArgsHasCwd = false;
  let outputArgsHasCwd = false;

  for (const arg of args) {
    if (arg.startsWith('--vm_name=')) {
      const value = arg.split('=', 2)[1];
      if (value) {
        containerId.vmName = value;
      }
      continue;
    }
    if (arg.startsWith('--target_container=')) {
      const value = arg.split('=', 2)[1];
      if (value) {
        containerId.containerName = value;
      }
      continue;
    }

    if (arg.startsWith('--cwd=')) {
      inputArgsHasCwd = outputArgsHasCwd = true;
    }
    outputArgs.push(arg);
  }

  // Parent container id or the default container id.
  const parentContainerId = parentLaunchInfo?.vsh?.containerId || {
    vmName: DEFAULT_VM_NAME,
    containerName: DEFAULT_CONTAINER_NAME,
  };

  // Follow parent containerId only if it is not already specified in `args`.
  if (Object.keys(containerId).length === 0) {
    containerId = parentContainerId;
  }

  if (containerId.vmName) {
    outputArgs.push(`--vm_name=${containerId.vmName}`);
  }
  if (containerId.containerName) {
    outputArgs.push(`--target_container=${containerId.containerName}`);
  }

  const parentTerminalId = parentLaunchInfo?.vsh?.terminalId;
  if (!inputArgsHasCwd &&
      parentTerminalId &&
      // It only makes sense to follow parent's CWD if the container id is the
      // same.
      containerId.vmName === parentContainerId.vmName &&
      containerId.containerName === parentContainerId.containerName) {
    outputArgs.push(`--cwd=terminal_id:${parentTerminalId}`);
    outputArgsHasCwd = true;
  }

  return {vsh: {
    args: outputArgs,
    containerId,
    hasCwd: outputArgsHasCwd,
  }};
}

/**
 * Create a title of the form <>@container:~ or <>@vm:~.
 *
 * @param {!ContainerId} containerId
 * @return {string}
 */
export function composeTitle(containerId) {
  let suffix = (containerId.containerName || containerId.vmName || '');
  suffix += ':~';
  return '<>@' + suffix;
}

/**
 * @param {!ContainerId} containerId The "canonicalized" container id. See type
 *     VshLaunchInfo.
 * @return {string}
 */
export function getInitialTitleCacheKey(containerId) {
  return 'cachedInitialTitle-' + JSON.stringify(
      containerId,
      // This is to make sure the order of the properties. This seems to be
      // documented in the ES5 standard.
      ['containerName', 'vmName'],
  );
}

/**
 * Set up a title handler. For vsh, it sets a proper document title before the
 * terminal is ready, and caches title for other terminals to use.
 *
 * @param {!TerminalInfoTracker} terminalInfoTracker
 */
export function setUpTitleHandler(terminalInfoTracker) {
  const launchInfo = terminalInfoTracker.launchInfo;
  if (launchInfo.crosh) {
    document.title = 'crosh';
    return;
  }

  if (launchInfo.tmux) {
    document.title = '[tmux]';
    return;
  }

  if (launchInfo.ssh) {
    document.title = 'SSH';
    return;
  }

  const {hasCwd, containerId} = launchInfo.vsh;

  const key = getInitialTitleCacheKey(containerId);

  if (terminalInfoTracker.parentTitle !== undefined) {
    document.title = terminalInfoTracker.parentTitle;
  } else {
    let title = window.localStorage.getItem(key);
    // Special title composing logic for non-default vm.
    if (title === null &&
        (containerId.vmName !== DEFAULT_VM_NAME ||
         containerId.containerName !== DEFAULT_CONTAINER_NAME)) {
      title = composeTitle(containerId);
    }
    if (title !== null) {
      document.title = title;
    }
  }

  if (!hasCwd) {
    // Set up a one-off observer to cache the initial title.
    const observer = new MutationObserver((mutations, observer) => {
      observer.disconnect();
      window.localStorage.setItem(key, mutations[0].target.textContent);
    });
    observer.observe(document.querySelector('title'), {childList: true});
  }
}
