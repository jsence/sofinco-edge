/**
 * Filtre d'accès basique — digest SHA-256, validation valable pour la journée (fuseau local).
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

  function localTodayIso () {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
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

  /** Ancien format permanent (digest seul) ou JSON invalide → pas d'accès. */
  function readStoredGrant () {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      if (/^[a-f0-9]{64}$/i.test(raw)) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.digest !== ACCESS_DIGEST) return null;
      if (typeof parsed.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.day)) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function isGranted () {
    if (!isGateEnforced()) return true;
    var stored = readStoredGrant();
    if (!stored) return false;
    return stored.day === localTodayIso();
  }

  function grant () {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        day: localTodayIso(),
        digest: ACCESS_DIGEST
      }));
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
    _localTodayIso: localTodayIso,
    _clearForTests: function () {
      try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
