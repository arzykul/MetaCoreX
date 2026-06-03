'use strict';

/**
 * MetaCoreX OS — EventBus
 *
 * Lightweight publish/subscribe message bus for real-time communication
 * between MetaCoreX OS modules (AI agents, oracle bridges, UI layers, etc.).
 *
 * Features:
 *  - Named channels (topics)
 *  - Wildcard subscriptions via "*"
 *  - One-time listeners (once)
 *  - Async handler support (errors are isolated per handler)
 *  - Per-channel and global listener limits to prevent memory leaks
 *  - Full event history replay for late subscribers
 *  - Namespace scoping for module isolation
 */

const DEFAULT_MAX_LISTENERS = 50;
const DEFAULT_HISTORY_LIMIT = 100;

class EventBus {
  /**
   * @param {object} [options]
   * @param {number} [options.maxListeners=50]    Max listeners per channel before warning.
   * @param {number} [options.historyLimit=100]   Max events stored per channel for replay.
   * @param {boolean} [options.verbose=false]     Log all emitted events to console.
   */
  constructor(options = {}) {
    this._listeners = new Map();       // channel → Set<{ fn, once }>
    this._history   = new Map();       // channel → Array<{ event, timestamp }>
    this._maxListeners  = options.maxListeners  ?? DEFAULT_MAX_LISTENERS;
    this._historyLimit  = options.historyLimit  ?? DEFAULT_HISTORY_LIMIT;
    this._verbose       = options.verbose       ?? false;
    this._wildcardKey   = '*';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to a channel.
   * @param {string}   channel   Event channel name (or "*" for all).
   * @param {Function} fn        Handler called with (eventData, channel).
   * @returns {Function}         Unsubscribe function — call it to remove this listener.
   */
  on(channel, fn) {
    this._assertChannel(channel);
    this._assertHandler(fn);
    return this._addListener(channel, fn, false);
  }

  /**
   * Subscribe to a channel for exactly one emission.
   * @param {string}   channel
   * @param {Function} fn
   * @returns {Function} Unsubscribe function.
   */
  once(channel, fn) {
    this._assertChannel(channel);
    this._assertHandler(fn);
    return this._addListener(channel, fn, true);
  }

  /**
   * Unsubscribe a specific handler from a channel.
   * @param {string}   channel
   * @param {Function} fn
   */
  off(channel, fn) {
    const listeners = this._listeners.get(channel);
    if (!listeners) return;
    for (const entry of listeners) {
      if (entry.fn === fn) {
        listeners.delete(entry);
        break;
      }
    }
  }

  /**
   * Emit an event on a channel, invoking all matching subscribers.
   * Wildcard subscribers ("*") receive every event.
   * Handlers are called asynchronously (errors are caught and logged).
   *
   * @param {string} channel
   * @param {*}      eventData
   */
  emit(channel, eventData) {
    this._assertChannel(channel);

    const record = { event: eventData, timestamp: Date.now() };
    this._pushHistory(channel, record);

    if (this._verbose) {
      console.log(`[EventBus] ${channel}`, eventData);
    }

    const toNotify = [
      ...(this._listeners.get(channel) ?? []),
      ...(channel !== this._wildcardKey ? (this._listeners.get(this._wildcardKey) ?? []) : []),
    ];

    for (const entry of toNotify) {
      if (entry.once) {
        const listeners = this._listeners.get(entry._channel);
        if (listeners) listeners.delete(entry);
      }
      this._invoke(entry.fn, eventData, channel);
    }
  }

  /**
   * Replay historical events for a channel to a new subscriber.
   * Useful when a module starts late and needs to catch up.
   *
   * @param {string}   channel
   * @param {Function} fn      Handler called for each historical event.
   */
  replay(channel, fn) {
    this._assertChannel(channel);
    this._assertHandler(fn);
    const history = this._history.get(channel) ?? [];
    for (const { event, timestamp } of history) {
      this._invoke(fn, event, channel, timestamp);
    }
  }

  /**
   * Remove all listeners from a specific channel (or all channels if omitted).
   * @param {string} [channel]
   */
  clear(channel) {
    if (channel) {
      this._listeners.delete(channel);
      this._history.delete(channel);
    } else {
      this._listeners.clear();
      this._history.clear();
    }
  }

  /**
   * Return the number of active listeners for a channel.
   * @param {string} channel
   * @returns {number}
   */
  listenerCount(channel) {
    return this._listeners.get(channel)?.size ?? 0;
  }

  /**
   * Return all channels that currently have active subscribers.
   * @returns {string[]}
   */
  channels() {
    return [...this._listeners.keys()].filter((k) => this._listeners.get(k)?.size > 0);
  }

  /**
   * Create a scoped sub-bus that prefixes all channel names.
   * Useful for isolating OS modules from each other.
   *
   * @param {string} namespace   e.g. "oracle" → emits on "oracle:fulfilled"
   * @returns {object}           Scoped { on, once, off, emit, replay } API.
   */
  namespace(namespace) {
    const prefix = (ch) => `${namespace}:${ch}`;
    return {
      on:     (ch, fn)   => this.on(prefix(ch), fn),
      once:   (ch, fn)   => this.once(prefix(ch), fn),
      off:    (ch, fn)   => this.off(prefix(ch), fn),
      emit:   (ch, data) => this.emit(prefix(ch), data),
      replay: (ch, fn)   => this.replay(prefix(ch), fn),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────────

  _addListener(channel, fn, once) {
    if (!this._listeners.has(channel)) {
      this._listeners.set(channel, new Set());
    }
    const listeners = this._listeners.get(channel);

    if (listeners.size >= this._maxListeners) {
      console.warn(
        `[EventBus] Warning: channel "${channel}" has ${listeners.size} listeners. ` +
        `Possible memory leak. Increase maxListeners if intentional.`
      );
    }

    const entry = { fn, once, _channel: channel };
    listeners.add(entry);

    return () => listeners.delete(entry);
  }

  _invoke(fn, eventData, channel, timestamp) {
    Promise.resolve()
      .then(() => fn(eventData, channel, timestamp ?? Date.now()))
      .catch((err) => {
        console.error(`[EventBus] Unhandled error in handler for "${channel}":`, err);
      });
  }

  _pushHistory(channel, record) {
    if (!this._history.has(channel)) {
      this._history.set(channel, []);
    }
    const hist = this._history.get(channel);
    hist.push(record);
    if (hist.length > this._historyLimit) {
      hist.shift();
    }
  }

  _assertChannel(channel) {
    if (typeof channel !== 'string' || channel.trim() === '') {
      throw new TypeError('[EventBus] channel must be a non-empty string');
    }
  }

  _assertHandler(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('[EventBus] handler must be a function');
    }
  }
}

module.exports = { EventBus };
