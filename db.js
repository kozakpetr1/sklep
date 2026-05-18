/**
 * SKLEP — DB Layer (IndexedDB)
 * Mimics SQL-like interface; stores items & categories.
 */

const DB = (() => {
  const DB_NAME = 'sklepDB';
  const DB_VERSION = 1;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const d = e.target.result;

        // Items store
        if (!d.objectStoreNames.contains('items')) {
          const items = d.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
          items.createIndex('room', 'room', { unique: false });
          items.createIndex('categoryId', 'categoryId', { unique: false });
          items.createIndex('expiry', 'expiry', { unique: false });
        }

        // Categories store
        if (!d.objectStoreNames.contains('categories')) {
          d.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
        }
      };

      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // ---------- Generic helpers ----------

  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function getById(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function add(storeName, obj) {
    return new Promise((resolve, reject) => {
      const store = tx(storeName, 'readwrite');
      obj.createdAt = obj.createdAt || new Date().toISOString();
      obj.updatedAt = new Date().toISOString();
      const req = store.add(obj);
      req.onsuccess = () => { obj.id = req.result; resolve(obj); };
      req.onerror   = () => reject(req.error);
    });
  }

  function put(storeName, obj) {
    return new Promise((resolve, reject) => {
      const store = tx(storeName, 'readwrite');
      obj.updatedAt = new Date().toISOString();
      const req = store.put(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror   = () => reject(req.error);
    });
  }

  function remove(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = tx(storeName, 'readwrite').delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror   = () => reject(req.error);
    });
  }

  // ---------- Public API ----------

  return {
    init: open,

    // Items
    items: {
      getAll: () => getAll('items'),
      getById: (id) => getById('items', id),
      add: (item) => add('items', item),
      update: (item) => put('items', item),
      delete: (id) => remove('items', id),
    },

    // Categories
    categories: {
      getAll: () => getAll('categories'),
      getById: (id) => getById('categories', id),
      add: (cat) => add('categories', cat),
      update: (cat) => put('categories', cat),
      delete: (id) => remove('categories', id),
    },
  };
})();
