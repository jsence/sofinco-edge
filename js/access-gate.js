/**
 * Filtre d'accès basique (première visite) — digest SHA-256, pas de secret en clair.
 */
(function (global) {
  var STORAGE_KEY = 'sofinco_edge_gate_v1';
  /** SHA-256 hex de la phrase d'accès (ne pas exposer la phrase dans ce fichier). */
  var ACCESS_DIGEST = 'ba2f4afe07f6ff7bb9d6ab3f66edb823a9fa2151a801de59d66372e0d9f091d6';

  function sha256Hex (text) {
    var enc = new TextEncoder().encode(String(text));
    return global.crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      var arr = Array.from(new Uint8Array(buf));
      return arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function isGateEnforced () {
    try {
      var loc = global.location;
      if (loc && loc.search.indexOf('enforceAccessGate=1') >= 0) return true;
      var h = (loc && loc.hostname) || '';
      if (!h || h === 'localhost' || h === '127.0.0.1') return false;
      return true;
    } catch (e) {
      return true;
    }
  }

  function isGranted () {
    if (!isGateEnforced()) return true;
    try {
      return global.localStorage.getItem(STORAGE_KEY) === ACCESS_DIGEST;
    } catch (e) {
      return false;
    }
  }

  function grant () {
    try {
      global.localStorage.setItem(STORAGE_KEY, ACCESS_DIGEST);
    } catch (e) { /* ignore */ }
  }

  function bind (onSuccess) {
    var gate = global.document.getElementById('access-gate');
    var form = global.document.getElementById('access-gate-form');
    var input = global.document.getElementById('access-gate-input');
    var err = global.document.getElementById('access-gate-error');
    if (!form || !input) return;

    if (gate) gate.hidden = false;

    function showError (msg) {
      if (!err) return;
      err.textContent = msg;
      err.hidden = !msg;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showError('');
      var value = (input.value || '').trim();
      if (!value) {
        showError('Veuillez saisir le code d\'accès.');
        return;
      }
      sha256Hex(value).then(function (digest) {
        if (digest === ACCESS_DIGEST) {
          grant();
          showError('');
          if (gate) gate.hidden = true;
          if (typeof onSuccess === 'function') onSuccess();
        } else {
          showError('Code incorrect. Accès refusé.');
          input.select();
        }
      }).catch(function () {
        showError('Impossible de vérifier le code sur cet navigateur.');
      });
    });

    input.addEventListener('input', function () {
      if (err && !err.hidden) showError('');
    });
  }

  global.SofincoAccessGate = {
    isGateEnforced: isGateEnforced,
    isGranted: isGranted,
    bind: bind,
    _clearForTests: function () {
      try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
