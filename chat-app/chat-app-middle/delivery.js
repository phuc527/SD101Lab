// Middle: reliable delivery over an unreliable network
// server-assigned seq per conversation + client message id (dedup) + ack/retry + reorder buffer + sync by lastSeq
const assert = require('assert');

let seed = 42; // deterministic randomness so every run is the same
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32), seed / 2 ** 32);

class ChatServer {
  seqByConv = new Map(); log = new Map(); seen = new Map(); // clientMsgId -> stored message
  receive(convId, clientMsgId, text) {
    if (this.seen.has(clientMsgId)) return this.seen.get(clientMsgId); // retry: same ack, not stored twice
    const seq = (this.seqByConv.get(convId) ?? 0) + 1; // total order within the conversation
    this.seqByConv.set(convId, seq);
    const msg = { convId, seq, clientMsgId, text };
    (this.log.get(convId) ?? this.log.set(convId, []).get(convId)).push(msg);
    this.seen.set(clientMsgId, msg);
    return msg;
  }
  sync(convId, afterSeq) { return (this.log.get(convId) ?? []).filter((m) => m.seq > afterSeq); }
}

class Receiver {
  lastSeq = 0; buffer = new Map(); shown = []; dupes = 0;
  onMessage(m) {
    if (m.seq <= this.lastSeq || this.buffer.has(m.seq)) return this.dupes++; // duplicate
    this.buffer.set(m.seq, m);
    while (this.buffer.has(this.lastSeq + 1)) { // show only contiguous messages, in order
      this.lastSeq++;
      this.shown.push(this.buffer.get(this.lastSeq));
      this.buffer.delete(this.lastSeq);
    }
  }
}

const DROP = 0.3, DUP = 0.2;
const server = new ChatServer();
const arrivals = []; // what reaches bob's device, in arrival order
let attempts = 0;

console.log(`=== Phase 1: alice sends 20 messages (drop ${DROP * 100}%, duplicate ${DUP * 100}%) ===`);
for (let i = 1; i <= 20; i++) {
  const clientMsgId = `alice-${i}`; // generated ONCE on the client (UUID in practice), reused on every retry
  for (let acked = false; !acked;) {
    attempts++;
    if (rand() < DROP) continue; // request lost -> timeout -> retry
    const msg = server.receive('c1', clientMsgId, `msg ${i}`);
    arrivals.push(msg);
    if (rand() < DUP) arrivals.push(msg); // network delivers a duplicate
    if (rand() < DROP) continue; // ack lost -> client retries -> server dedups
    acked = true;
  }
}
for (let i = arrivals.length - 1; i > 0; i--) if (rand() < 0.3) [arrivals[i], arrivals[i - 1]] = [arrivals[i - 1], arrivals[i]]; // reordering

const bob = new Receiver();
arrivals.forEach((m) => bob.onMessage(m));
console.log(`send attempts: ${attempts} for 20 messages | stored on server: ${server.log.get('c1').length}`);
console.log(`arrived at bob: ${arrivals.length} (with duplicates, out of order) | shown: ${bob.shown.length} | duplicates dropped: ${bob.dupes}`);
console.log('first arrivals seq:', arrivals.slice(0, 10).map((m) => m.seq).join(' '));

console.log('\n=== Phase 2: bob goes offline, alice sends 5 more, bob reconnects ===');
for (let i = 21; i <= 25; i++) server.receive('c1', `alice-${i}`, `msg ${i}`); // pushes are lost, bob is offline
const missed = server.sync('c1', bob.lastSeq); // GET /sync?conv=c1&after=lastSeq
console.log(`bob reconnects with lastSeq=${bob.lastSeq} -> server returns ${missed.length} missed messages`);
missed.forEach((m) => bob.onMessage(m));

const seqs = bob.shown.map((m) => m.seq);
console.log('bob finally shows seq:', seqs.join(' '));
assert.equal(server.log.get('c1').length, 25); // no duplicate stored despite retries
assert.deepEqual(seqs, Array.from({ length: 25 }, (_, i) => i + 1)); // exactly once, in order
assert.ok(arrivals.length > 20);
console.log('\nok: exactly-once display = at-least-once delivery + idempotent dedup. Limitation: one server. See chat-app-senior.');
