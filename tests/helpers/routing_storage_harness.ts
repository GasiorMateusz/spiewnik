import { setGlobalProperty } from './hook_harness';

/**
 * In-memory MockLocalStorage adhering to W3C Storage interface.
 * Includes fault injection for QuotaExceededError and SecurityError.
 */
export class MockLocalStorage implements Storage {
  private store: Map<string, string> = new Map();
  public quotaExceeded: boolean = false;
  public securityError: boolean = false;

  get length(): number {
    if (this.securityError) throw new DOMException('Access denied', 'SecurityError');
    return this.store.size;
  }

  getItem(key: string): string | null {
    if (this.securityError) throw new DOMException('Access denied', 'SecurityError');
    const val = this.store.get(String(key));
    return val !== undefined ? val : null;
  }

  setItem(key: string, value: any): void {
    if (this.securityError) throw new DOMException('Access denied', 'SecurityError');
    if (this.quotaExceeded) {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    }
    this.store.set(String(key), String(value));
  }

  removeItem(key: string): void {
    if (this.securityError) throw new DOMException('Access denied', 'SecurityError');
    this.store.delete(String(key));
  }

  clear(): void {
    if (this.securityError) throw new DOMException('Access denied', 'SecurityError');
    this.store.clear();
  }

  key(index: number): string | null {
    if (this.securityError) throw new DOMException('Access denied', 'SecurityError');
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  simulateQuotaExceeded(enabled: boolean = true) {
    this.quotaExceeded = enabled;
  }

  simulateSecurityError(enabled: boolean = true) {
    this.securityError = enabled;
  }

  dump(): Record<string, string> {
    const res: Record<string, string> = {};
    for (const [k, v] of this.store.entries()) {
      res[k] = v;
    }
    return res;
  }
}

export interface MockLocation {
  hash: string;
  href: string;
  pathname: string;
  search: string;
  origin: string;
}

/**
 * Headless browser environment simulating window.location, window.localStorage,
 * event dispatching (hashchange, popstate, storage, spiewnik-storage-sync),
 * and listener tracking for leak verification.
 */
export class MockRoutingEnvironment {
  private _hash: string = '';
  public localStorage: MockLocalStorage;
  public listeners: Record<string, Function[]> = {};
  private restoreGlobals: Array<() => void> = [];

  constructor(initialHash: string = '') {
    this._hash = initialHash;
    this.localStorage = new MockLocalStorage();
  }

  get hash(): string {
    return this._hash;
  }

  set hash(val: string) {
    this.setHash(val, true);
  }

  setHash(newHash: string, triggerEvent: boolean = true) {
    const normalized = newHash.startsWith('#') ? newHash : (newHash ? `#${newHash}` : '');
    const oldHash = this._hash;
    this._hash = normalized;

    if (triggerEvent && oldHash !== normalized) {
      this.dispatchEvent('hashchange', {
        type: 'hashchange',
        oldURL: `http://localhost/${oldHash}`,
        newURL: `http://localhost/${normalized}`,
      });
    }
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  dispatchEvent(event: string | { type: string; [key: string]: any }, data?: any) {
    const eventType = typeof event === 'string' ? event : event.type;
    const eventObj = typeof event === 'string' ? { type: event, ...data } : event;
    const handlers = this.listeners[eventType] || [];
    for (const h of handlers) {
      h(eventObj);
    }
  }

  getListenerCount(event: string): number {
    return (this.listeners[event] || []).length;
  }

  install() {
    const self = this;

    const mockLocation: MockLocation = {
      get hash() {
        return self._hash;
      },
      set hash(val: string) {
        self.setHash(val, true);
      },
      get href() {
        return `http://localhost/${self._hash}`;
      },
      set href(val: string) {
        const hashIdx = val.indexOf('#');
        self.setHash(hashIdx !== -1 ? val.slice(hashIdx) : '', true);
      },
      pathname: '/',
      search: '',
      origin: 'http://localhost',
    };

    const mockWindow = {
      location: mockLocation,
      localStorage: self.localStorage,
      addEventListener: (evt: string, handler: Function) => self.addEventListener(evt, handler),
      removeEventListener: (evt: string, handler: Function) => self.removeEventListener(evt, handler),
      dispatchEvent: (evt: any) => {
        self.dispatchEvent(evt);
        return true;
      },
      CustomEvent: globalThis.CustomEvent,
    };

    this.restoreGlobals.push(setGlobalProperty('window', mockWindow));
    this.restoreGlobals.push(setGlobalProperty('location', mockLocation));
    this.restoreGlobals.push(setGlobalProperty('localStorage', self.localStorage));
  }

  uninstall() {
    while (this.restoreGlobals.length > 0) {
      const restore = this.restoreGlobals.pop();
      restore?.();
    }
    this.listeners = {};
    this.localStorage.securityError = false;
    this.localStorage.quotaExceeded = false;
    this.localStorage.clear();
  }
}
