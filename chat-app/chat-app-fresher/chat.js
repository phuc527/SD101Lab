// Fresher: data model, send, paginated history, inbox
const assert = require('assert');

// Tables:
// conversations(id, type)            type = 'dm' | 'group'
// members(conversation_id, user_id)
// messages(id, conversation_id, sender_id, text, created_at)   index (conversation_id, id DESC)
const conversations = new Map(); // id -> { id, type, members: Set, lastMessageId }
const messages = [];
let msgSeq = 0;

function getOrCreateDM(a, b) {
  const id = 'dm:' + [a, b].sort().join(':'); // (a,b) and (b,a) map to the same conversation
  if (!conversations.has(id)) conversations.set(id, { id, type: 'dm', members: new Set([a, b]), lastMessageId: 0 });
  return id;
}
function createGroup(name, members) {
  const id = `group:${name}`;
  conversations.set(id, { id, type: 'group', members: new Set(members), lastMessageId: 0 });
  return id;
}
function send(convId, sender, text) {
  const c = conversations.get(convId);
  if (!c?.members.has(sender)) throw new Error('not a member'); // authorization check
  const m = { id: ++msgSeq, convId, sender, text };
  messages.push(m);
  c.lastMessageId = m.id;
  return m;
}
// Newest first, cursor = beforeId (scroll up to load older messages)
const history = (convId, beforeId = Infinity, limit = 3) =>
  messages.filter((m) => m.convId === convId && m.id < beforeId).sort((a, b) => b.id - a.id).slice(0, limit);
// Inbox: my conversations, most recently active first
const inbox = (user) =>
  [...conversations.values()].filter((c) => c.members.has(user)).sort((a, b) => b.lastMessageId - a.lastMessageId).map((c) => c.id);

const dm = getOrCreateDM('alice', 'bob');
assert.equal(getOrCreateDM('bob', 'alice'), dm);
const team = createGroup('team', ['alice', 'bob', 'carol']);
for (let i = 1; i <= 5; i++) send(dm, i % 2 ? 'alice' : 'bob', `dm message ${i}`);
send(team, 'carol', 'standup in 5 minutes');

const page1 = history(dm);
const page2 = history(dm, page1.at(-1).id);
console.log('dm page 1:', page1.map((m) => `${m.sender}: ${m.text}`));
console.log('dm page 2:', page2.map((m) => `${m.sender}: ${m.text}`));
console.log("bob's inbox:", inbox('bob'));
assert.deepEqual(page1.map((m) => m.text), ['dm message 5', 'dm message 4', 'dm message 3']);
assert.equal(page2.length, 2);
assert.deepEqual(inbox('bob'), [team, dm]);
assert.throws(() => send(team, 'mallory', 'hi'), /not a member/);
console.log('mallory sends to team -> rejected (not a member)');
console.log('\nok. Limitation: bob only sees new messages if he keeps re-querying. See chat-app-junior for real-time push.');
