/**
 * HızlıOku Pro - Hafıza, SHA-256 Parmak İzi ve Ayraç (Bookmark) Yöneticisi
 * Tarayıcıda IndexedDB + LocalStorage kullanarak PDF ve metinlerin
 * kaldığı yeri, ayraçları ve kullanıcı ayarlarını kalıcı olarak saklar.
 */

const STORAGE_KEYS = {
  SETTINGS: 'hizlioku_settings_v1',
  RECENT_INDEX: 'hizlioku_recent_docs_v1',
  LAST_ACTIVE_HASH: 'hizlioku_last_active_hash_v1'
};

const DB_NAME = 'HizliOkuProDB';
const DB_VERSION = 1;
const STORE_DOCS = 'documents';

const DEFAULT_SETTINGS = {
  theme: 'apple', // 'apple' | 'linear' | 'kindle'
  wpm: 325,
  chunkSize: 3,
  windowWidth: 750,
  windowHeight: 500,
  fontSize: 32,
  fontColor: '#f5f5f7',
  backgroundColor: '#000000',
  alignment: 'center', // 'center' | 'left' | 'right' | 'orp'
  speedVariability: true,
  sentenceBreak: true,
  sentencePause: true,
  skipStopwords: false,
  // Akıllı kitap özellikleri
  detectHeadings: true,
  inlineFootnotes: true,
  skipBoilerplate: true,
  warmupMode: true,
  autoJumpBookmark: true,
  ocrLanguage: 'tur+eng'
};

class StorageManager {
  constructor() {
    this.dbPromise = this._initDB();
  }

  _initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          const store = db.createObjectStore(STORE_DOCS, { keyPath: 'docHash' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = () => resolve(null);
    });
  }

  /**
   * Dosya (ArrayBuffer) veya Metin için benzersiz SHA-256 parmak izi üretir.
   * file:// protokolünde crypto.subtle kısıtlıysa deterministik FNV-1a/64-bit hibrit hash kullanır.
   */
  async computeHash(input) {
    let buffer;
    if (typeof input === 'string') {
      buffer = new TextEncoder().encode(input.trim());
    } else if (input instanceof ArrayBuffer) {
      buffer = new Uint8Array(input);
    } else if (ArrayBuffer.isView(input)) {
      buffer = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    } else {
      buffer = new TextEncoder().encode(String(input));
    }

    if (window.crypto && window.crypto.subtle) {
      try {
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        // Fallback below
      }
    }

    // Fallback deterministik parmak izi (file:// protokolü için)
    let h1 = 0xdeadbeef ^ buffer.length;
    let h2 = 0x41c6ce57 ^ buffer.length;
    const step = Math.max(1, Math.floor(buffer.length / 65536));
    for (let i = 0; i < buffer.length; i += step) {
      const ch = buffer[i];
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (
      (h1 >>> 0).toString(16).padStart(8, '0') +
      (h2 >>> 0).toString(16).padStart(8, '0') +
      '_' +
      buffer.length.toString(16)
    );
  }

  getSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(newSettings) {
    const merged = { ...this.getSettings(), ...newSettings };
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    } catch (e) {
      console.warn('Ayarlar kaydedilemedi:', e);
    }
    return merged;
  }

  resetSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Belge durumunu, kalınan kelimeyi ve ayraçları kaydeder.
   */
  async saveDocumentState(docData) {
    if (!docData || !docData.docHash) return null;

    const existing = await this.getDocumentState(docData.docHash);
    const now = new Date().toISOString();

    const record = {
      docHash: docData.docHash,
      title: docData.title || (existing && existing.title) || 'Adsız Belge',
      sourceType: docData.sourceType || (existing && existing.sourceType) || 'text',
      totalWords: docData.totalWords ?? (existing ? existing.totalWords : 0),
      totalPages: docData.totalPages ?? (existing ? existing.totalPages : 1),
      lastWordIndex: docData.lastWordIndex ?? (existing ? existing.lastWordIndex : 0),
      bookmarks: docData.bookmarks ?? (existing ? existing.bookmarks : []),
      skippedSectionsSummary:
        docData.skippedSectionsSummary ?? (existing ? existing.skippedSectionsSummary : null),
      tokens: docData.tokens ?? (existing ? existing.tokens : null),
      rawStructure: docData.rawStructure ?? (existing ? existing.rawStructure : null),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    const db = await this.dbPromise;
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_DOCS], 'readwrite');
          const store = tx.objectStore(STORE_DOCS);
          store.put(record);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (err) {
          resolve(false);
        }
      });
    }

    // Ayrıca hafif özet bilgisini localStorage'da tut (hızlı erişim ve fallback için)
    this._updateRecentSummary(record);
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVE_HASH, record.docHash);
    } catch (e) {}

    return record;
  }

  _updateRecentSummary(record) {
    try {
      const list = this.getRecentSummaries();
      const filtered = list.filter((item) => item.docHash !== record.docHash);
      const summary = {
        docHash: record.docHash,
        title: record.title,
        sourceType: record.sourceType,
        totalWords: record.totalWords,
        totalPages: record.totalPages,
        lastWordIndex: record.lastWordIndex,
        bookmarks: record.bookmarks || [],
        updatedAt: record.updatedAt
      };
      filtered.unshift(summary);
      localStorage.setItem(STORAGE_KEYS.RECENT_INDEX, JSON.stringify(filtered.slice(0, 20)));
    } catch (e) {
      console.warn('Özet listesi güncellenemedi:', e);
    }
  }

  getRecentSummaries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.RECENT_INDEX);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  async getDocumentState(docHash) {
    if (!docHash) return null;
    const db = await this.dbPromise;
    if (db) {
      const result = await new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_DOCS], 'readonly');
          const store = tx.objectStore(STORE_DOCS);
          const req = store.get(docHash);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
      if (result) return result;
    }

    // Fallback: localStorage özetinden getir
    const summaries = this.getRecentSummaries();
    return summaries.find((s) => s.docHash === docHash) || null;
  }

  async updateReadingPosition(docHash, wordIndex, totalWords) {
    if (!docHash) return;
    const doc = await this.getDocumentState(docHash);
    if (doc) {
      doc.lastWordIndex = wordIndex;
      if (totalWords) doc.totalWords = totalWords;
      doc.updatedAt = new Date().toISOString();
      await this.saveDocumentState(doc);
    }
  }

  async addBookmark(docHash, { label, wordIndex, page, snippet }) {
    const doc = await this.getDocumentState(docHash);
    if (!doc) return null;

    const bookmarks = Array.isArray(doc.bookmarks) ? [...doc.bookmarks] : [];
    const newBookmark = {
      id: 'bm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      label: label || `Ayraç (${ bookmarks.length + 1 })`,
      wordIndex: Math.max(0, wordIndex),
      page: page || 1,
      snippet: snippet || '',
      createdAt: new Date().toISOString()
    };

    bookmarks.unshift(newBookmark);
    doc.bookmarks = bookmarks;
    await this.saveDocumentState(doc);
    return newBookmark;
  }

  async removeBookmark(docHash, bookmarkId) {
    const doc = await this.getDocumentState(docHash);
    if (!doc || !Array.isArray(doc.bookmarks)) return [];
    doc.bookmarks = doc.bookmarks.filter((b) => b.id !== bookmarkId);
    await this.saveDocumentState(doc);
    return doc.bookmarks;
  }

  async deleteDocument(docHash) {
    const db = await this.dbPromise;
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_DOCS], 'readwrite');
          tx.objectStore(STORE_DOCS).delete(docHash);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }
    try {
      const list = this.getRecentSummaries().filter((i) => i.docHash !== docHash);
      localStorage.setItem(STORAGE_KEYS.RECENT_INDEX, JSON.stringify(list));
    } catch (e) {}
  }

  getLastActiveHash() {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_HASH);
    } catch (e) {
      return null;
    }
  }
}

window.storageManager = new StorageManager();
