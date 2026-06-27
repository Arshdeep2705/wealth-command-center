/* ============================================================================
   sync.js — cloud sync engine (passcode-gated edge function)
   Offline-first: localStorage is the working copy; the cloud is the shared brain.
   Pushes are debounced; pulls happen on unlock + window focus. Last-write-wins
   with a soft conflict guard (server-newer → client reloads server copy).
   ============================================================================ */
(function (global) {
  "use strict";
  var CFG = global.WCC_CONFIG || {};
  var PIN_KEY = "wcc_pin", BASE_KEY = "wcc_base_ts";
  var listeners = {}, dirty = false, pushTimer = null, lastData = null, baseUpdatedAt = null, inflight = false;

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, p) { (listeners[ev] || []).forEach(function (f) { try { f(p); } catch (e) {} }); }

  function enabled() { return !!(CFG.enabled && CFG.syncUrl && CFG.anonKey); }
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function hasLocalPin() { return !!ls(PIN_KEY); }
  function getPin() { return ls(PIN_KEY) || ""; }

  function call(action, body) {
    return fetch(CFG.syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": CFG.anonKey, "Authorization": "Bearer " + CFG.anonKey },
      body: JSON.stringify(Object.assign({ action: action }, body || {}))
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  function status() { return call("status").then(function (r) { return r.body; }); }

  function setup(pin, localData) {
    return call("setpin", { pin: pin, data: localData }).then(function (r) {
      if (r.status !== 200) throw err(r);
      lsSet(PIN_KEY, pin); baseUpdatedAt = r.body.updated_at; lsSet(BASE_KEY, baseUpdatedAt || "");
      return r.body;
    });
  }
  function unlock(pin) {
    return call("get", { pin: pin }).then(function (r) {
      if (r.status === 400 && r.body.needsSetup) { var e = new Error("needs setup"); e.code = "SETUP"; throw e; }
      if (r.status !== 200) throw err(r);
      lsSet(PIN_KEY, pin); baseUpdatedAt = r.body.updated_at; lsSet(BASE_KEY, baseUpdatedAt || "");
      return r.body;
    });
  }
  function pull() {
    if (!hasLocalPin()) return Promise.reject(locked());
    return call("get", { pin: getPin() }).then(function (r) {
      if (r.status === 401) { lsDel(PIN_KEY); throw locked(); }
      if (r.status !== 200) throw err(r);
      baseUpdatedAt = r.body.updated_at; lsSet(BASE_KEY, baseUpdatedAt || "");
      return r.body;
    });
  }
  function pushNow(data) {
    if (!hasLocalPin()) return Promise.reject(locked());
    lastData = data; inflight = true; emit("status", "syncing");
    return call("put", { pin: getPin(), data: data, baseUpdatedAt: baseUpdatedAt }).then(function (r) {
      inflight = false;
      if (r.status === 401) { lsDel(PIN_KEY); emit("status", "locked"); emit("locked"); throw locked(); }
      if (r.status === 409 && r.body.conflict) {
        baseUpdatedAt = r.body.updated_at; lsSet(BASE_KEY, baseUpdatedAt || "");
        dirty = false; emit("remote", r.body); emit("status", "synced");
        return { conflict: true, data: r.body.data };
      }
      if (r.status !== 200) { emit("status", "error"); throw err(r); }
      baseUpdatedAt = r.body.updated_at; lsSet(BASE_KEY, baseUpdatedAt || ""); dirty = false;
      emit("status", "synced"); return r.body;
    }, function (netErr) { inflight = false; dirty = true; emit("status", "offline"); throw netErr; });
  }
  function queuePush(data) {
    if (!enabled() || !hasLocalPin()) return;
    dirty = true; lastData = data; emit("status", "pending");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushNow(data).catch(function () {}); }, 1200);
  }
  function flush() { if (dirty && lastData && hasLocalPin() && !inflight) pushNow(lastData).catch(function () {}); }
  function changePin(cur, next) {
    return call("changepin", { pin: cur, newPin: next }).then(function (r) {
      if (r.status !== 200) throw err(r); lsSet(PIN_KEY, next); return true;
    });
  }
  function signOut() { lsDel(PIN_KEY); lsDel(BASE_KEY); baseUpdatedAt = null; }

  // ---- AI assistant ----
  function hasKey() { return call("haskey", { pin: getPin() }).then(function (r) { return !!(r.body && r.body.hasKey); }); }
  function setKey(key) { return call("setkey", { pin: getPin(), key: key }).then(function (r) { if (r.status !== 200) throw err(r); return r.body; }); }
  function assistant(message, context) {
    return call("assistant", { pin: getPin(), message: message, context: context }).then(function (r) {
      if (r.status !== 200) throw err(r);
      return r.body.result;
    });
  }

  function err(r) { var e = new Error((r.body && r.body.error) || ("HTTP " + r.status)); e.code = r.status; return e; }
  function locked() { var e = new Error("locked"); e.code = 401; return e; }

  global.addEventListener("online", flush);
  global.addEventListener("focus", function () { if (!dirty && hasLocalPin()) emit("refresh"); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !dirty && hasLocalPin()) emit("refresh"); });

  baseUpdatedAt = ls(BASE_KEY) || null;

  global.Sync = {
    enabled: enabled, hasLocalPin: hasLocalPin, status: status, setup: setup, unlock: unlock,
    pull: pull, push: pushNow, queuePush: queuePush, flush: flush, changePin: changePin,
    signOut: signOut, hasKey: hasKey, setKey: setKey, assistant: assistant,
    on: on, isDirty: function () { return dirty; }, base: function () { return baseUpdatedAt; }
  };
})(window);
