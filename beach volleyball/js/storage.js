window.BeachVolley = window.BeachVolley || {};

(function(BV) {
  var DB_NAME = 'BeachVolleyDB';
  var DB_VERSION = 1;
  var db = null;

  function openDB() {
    return new Promise(function(resolve, reject) {
      if (db) { resolve(db); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
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
    return openDB().then(function() {
      return new Promise(function(resolve, reject) {
        var req = txStore(storeName, 'readwrite').put(record);
        req.onsuccess = function() { resolve(); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function idbGetAll(storeName) {
    return openDB().then(function() {
      return new Promise(function(resolve, reject) {
        var req = txStore(storeName, 'readonly').getAll();
        req.onsuccess = function(e) { resolve(e.target.result || []); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function idbGet(storeName, id) {
    return openDB().then(function() {
      return new Promise(function(resolve, reject) {
        var req = txStore(storeName, 'readonly').get(id);
        req.onsuccess = function(e) { resolve(e.target.result || null); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function idbDelete(storeName, id) {
    return openDB().then(function() {
      return new Promise(function(resolve, reject) {
        var req = txStore(storeName, 'readwrite').delete(id);
        req.onsuccess = function() { resolve(); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  function idbClear(storeName) {
    return openDB().then(function() {
      return new Promise(function(resolve, reject) {
        var req = txStore(storeName, 'readwrite').clear();
        req.onsuccess = function() { resolve(); };
        req.onerror = function(e) { reject(e.target.error); };
      });
    });
  }

  BV.Storage = {
    init: function() { return openDB(); },

    saveCurrentMatch: function(state) {
      localStorage.setItem('bv-current-match', JSON.stringify(state));
    },
    loadCurrentMatch: function() {
      try { return JSON.parse(localStorage.getItem('bv-current-match')); }
      catch(e) { return null; }
    },
    clearCurrentMatch: function() {
      localStorage.removeItem('bv-current-match');
    },

    saveCurrentTournament: function(state) {
      localStorage.setItem('bv-current-tournament', JSON.stringify(state));
    },
    loadCurrentTournament: function() {
      try { return JSON.parse(localStorage.getItem('bv-current-tournament')); }
      catch(e) { return null; }
    },
    clearCurrentTournament: function() {
      localStorage.removeItem('bv-current-tournament');
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
})(window.BeachVolley);
