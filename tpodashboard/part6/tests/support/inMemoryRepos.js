'use strict';

/**
 * Minimal in-memory implementations of the repo/audit/event-bus interfaces
 * the services expect, used ONLY by the test suite in this reference repo.
 * A real integration wires the same interfaces to actual DB repos, the
 * host app's audit service, and its real event bus.
 */

function createInMemoryOfferRepo() {
  const store = new Map();
  return {
    create(offer) {
      store.set(offer.id, { ...offer });
      return { ...offer };
    },
    update(id, offer) {
      store.set(id, { ...offer });
      return { ...offer };
    },
    getById(id) {
      const o = store.get(id);
      return o ? { ...o } : null;
    },
    listByStudent(studentId) {
      return [...store.values()].filter((o) => o.studentId === studentId).map((o) => ({ ...o }));
    },
    listAll() {
      return [...store.values()].map((o) => ({ ...o }));
    },
  };
}

function createInMemoryVersionRepo() {
  const store = new Map(); // offerId -> versions[]
  return {
    addVersion(offerId, snapshot, meta) {
      if (!store.has(offerId)) store.set(offerId, []);
      store.get(offerId).push({ snapshot, ...meta });
    },
    listVersions(offerId) {
      return store.get(offerId) ?? [];
    },
  };
}

function createInMemoryJoiningRepo() {
  const store = new Map();
  return {
    create(record) {
      store.set(record.id, { ...record });
      return { ...record };
    },
    update(id, record) {
      store.set(id, { ...record });
      return { ...record };
    },
    getById(id) {
      const r = store.get(id);
      return r ? { ...r } : null;
    },
    getByOfferId(offerId) {
      return [...store.values()].find((r) => r.offerId === offerId) ?? null;
    },
    listAll() {
      return [...store.values()].map((r) => ({ ...r }));
    },
  };
}

function createInMemoryAuditSink() {
  const entries = [];
  return {
    record(entry) {
      entries.push(entry);
    },
    all() {
      return entries;
    },
  };
}

function createInMemoryEventBus() {
  const emitted = [];
  return {
    emit(name, payload) {
      emitted.push({ name, payload });
    },
    all() {
      return emitted;
    },
    ofType(name) {
      return emitted.filter((e) => e.name === name);
    },
  };
}

module.exports = {
  createInMemoryOfferRepo,
  createInMemoryVersionRepo,
  createInMemoryJoiningRepo,
  createInMemoryAuditSink,
  createInMemoryEventBus,
};
