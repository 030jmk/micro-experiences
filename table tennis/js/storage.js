window.PongScore = window.PongScore || {};

(function(PS) {
  const DB_NAME = 'PongScoreDB';
  const DB_VERSION = 1;
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('matches')) {
          d.createObjectStore('matches', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('tournaments')) {
          d.createObjectStore('tournaments', { keyPath: 'id' });
        }
      };
      req.onsuccess = function(e) { db = e.target.result; resolve(db); };
      req.onerror = function(e) { reject(e.target.error); };
    });
  }

  function txStore(storeName, mode) {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function idbPut(storeName, record) {
    return openDB().then(() => new Promise((resolve, reject) => {
      const req = txStore(storeName, 'readwrite').put(record);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    }));
  }

  function idbGetAll(storeName) {
    return openDB().then(() => new Promise((resolve, reject) => {
      const req = txStore(storeName, 'readonly').getAll();
      req.onsuccess = e => resolve(e.target.result || []);
      req.onerror = e => reject(e.target.error);
    }));
  }

  function idbGet(storeName, id) {
    return openDB().then(() => new Promise((resolve, reject) => {
      const req = txStore(storeName, 'readonly').get(id);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror = e => reject(e.target.error);
    }));
  }

  function idbDelete(storeName, id) {
    return openDB().then(() => new Promise((resolve, reject) => {
      const req = txStore(storeName, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    }));
  }

  function idbClear(storeName) {
    return openDB().then(() => new Promise((resolve, reject) => {
      const req = txStore(storeName, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = e => reject(e.target.error);
    }));
  }

  PS.Storage = {
    init: function() { return openDB(); },

    saveCurrentMatch: function(state) {
      localStorage.setItem('ps-current-match', JSON.stringify(state));
    },
    loadCurrentMatch: function() {
      try { return JSON.parse(localStorage.getItem('ps-current-match')); }
      catch(e) { return null; }
    },
    clearCurrentMatch: function() {
      localStorage.removeItem('ps-current-match');
    },

    saveCurrentTournament: function(state) {
      localStorage.setItem('ps-current-tournament', JSON.stringify(state));
    },
    loadCurrentTournament: function() {
      try { return JSON.parse(localStorage.getItem('ps-current-tournament')); }
      catch(e) { return null; }
    },
    clearCurrentTournament: function() {
      localStorage.removeItem('ps-current-tournament');
    },

    saveMatch: function(record) { return idbPut('matches', record); },
    getMatches: function() {
      return idbGetAll('matches').then(function(arr) {
        return arr.sort(function(a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });
      });
    },
    getMatch: function(id) { return idbGet('matches', id); },
    deleteMatch: function(id) { return idbDelete('matches', id); },
    clearMatches: function() { return idbClear('matches'); },

    saveTournament: function(record) { return idbPut('tournaments', record); },
    getTournaments: function() {
      return idbGetAll('tournaments').then(function(arr) {
        return arr.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      });
    },
    getTournament: function(id) { return idbGet('tournaments', id); },
    deleteTournament: function(id) { return idbDelete('tournaments', id); },
    clearTournaments: function() { return idbClear('tournaments'); }
  };
})(window.PongScore);
