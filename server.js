const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const FRONTEND_ROOT = path.join(ROOT, 'frontend');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const sessions = new Map();
const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

function loadDb() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function checkPassword(password, stored) { const [salt, key] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(key, 'hex'), crypto.scryptSync(password, salt, 64)); }
function publicUser(user, db) { return { id: user.id, name: user.name, handle: user.handle, initials: user.initials, color: user.color, bio: user.bio, profileImage: user.profileImage || null, followers: user.followers.length, following: user.following.length, followingIds: user.following }; }
function tokenFor(user) { const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user.id); return token; }
function currentUser(req, db) { const token = req.headers.authorization?.replace('Bearer ', ''); const userId = sessions.get(token); return db.users.find((user) => user.id === userId); }
function send(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let data = ''; req.on('data', (chunk) => { data += chunk; if (data.length > 1000000) reject(new Error('Request too large')); }); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } }); }); }
function requireAuth(req, res, db) { const user = currentUser(req, db); if (!user) { send(res, 401, { error: 'Please log in first.' }); return null; } return user; }
function decorateComment(comment, db) { const author = db.users.find((item) => item.id === comment.authorId); return { ...comment, name: author?.name || 'Unknown', handle: author?.handle || '@unknown', initials: author?.initials || '?', color: author?.color || '#d9f36a', profileImage: author?.profileImage || null, time: relativeTime(comment.createdAt) }; }
function decoratePost(post, db, user) { const author = db.users.find((item) => item.id === post.authorId); const comments = (post.comments || []).map((comment) => decorateComment(comment, db)); return { ...post, name: author.name, handle: author.handle, initials: author.initials, color: author.color, profileImage: author.profileImage || null, liked: post.likes.includes(user.id), likes: post.likes.length, following: user.following.includes(author.id), comments: comments.length, commentItems: comments, shares: post.shares.length, time: relativeTime(post.createdAt) }; }
function validImage(image) { return !image || (typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= 700000); }
function relativeTime(timestamp) { const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000)); const units = [{ limit: 60, size: 1, label: 'second' }, { limit: 3600, size: 60, label: 'minute' }, { limit: 86400, size: 3600, label: 'hour' }, { limit: 604800, size: 86400, label: 'day' }, { limit: 2592000, size: 604800, label: 'week' }, { limit: 31536000, size: 2592000, label: 'month' }, { limit: Infinity, size: 31536000, label: 'year' }]; const unit = units.find((item) => seconds < item.limit); const amount = Math.floor(seconds / unit.size); return `${amount} ${unit.label}${amount === 1 ? '' : 's'} ago`; }
function conversationSummary(other, user, db) { const messages = db.messages.filter((message) => (message.from === user.id && message.to === other.id) || (message.from === other.id && message.to === user.id)).sort((a, b) => b.createdAt - a.createdAt); const latest = messages[0]; return { ...publicUser(other, db), preview: latest?.text || 'Start a conversation', time: latest ? relativeTime(latest.createdAt) : '' }; }

async function api(req, res, db) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (parts[0] !== 'api') return serveStatic(req, res, url.pathname);
  try {
    if (parts[1] === 'auth' && parts[2] === 'register' && req.method === 'POST') {
      const body = await readBody(req); const name = String(body.name || '').trim(); const handle = String(body.handle || '').trim().toLowerCase().replace(/^@/, ''); const password = String(body.password || '');
      if (name.length < 2 || handle.length < 3 || password.length < 6) return send(res, 400, { error: 'Use a name, a handle with 3+ characters, and a password with 6+ characters.' });
      if (db.users.some((user) => user.handle === `@${handle}`)) return send(res, 409, { error: 'That handle is already taken.' });
      const user = { id: crypto.randomUUID(), name, handle: `@${handle}`, initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), color: ['#d9f36a', '#c9eee3', '#f2c66d', '#f7b9ab'][db.users.length % 4], bio: 'Finding good ideas and good people.', profileImage: null, password: hashPassword(password), followers: [], following: [], createdAt: Date.now() };
      db.users.push(user); saveDb(db); return send(res, 201, { token: tokenFor(user), user: publicUser(user, db) });
    }
    if (parts[1] === 'auth' && parts[2] === 'login' && req.method === 'POST') {
      const body = await readBody(req); const handle = String(body.handle || '').trim().toLowerCase(); const user = db.users.find((item) => item.handle === `@${handle.replace(/^@/, '')}`);
      if (!user || !checkPassword(String(body.password || ''), user.password)) return send(res, 401, { error: 'Handle or password is incorrect.' });
      return send(res, 200, { token: tokenFor(user), user: publicUser(user, db) });
    }
    const user = requireAuth(req, res, db); if (!user) return;
    if (parts[1] === 'profile' && parts.length === 2 && req.method === 'POST') { const body = await readBody(req); const name = String(body.name || '').trim(); const handle = String(body.handle || '').trim().toLowerCase().replace(/^@/, ''); const bio = String(body.bio || '').trim(); if (name.length < 2 || handle.length < 3) return send(res, 400, { error: 'Name and handle are required.' }); if (db.users.some((item) => item.id !== user.id && item.handle === `@${handle}`)) return send(res, 409, { error: 'That handle is already taken.' }); user.name = name; user.handle = `@${handle}`; user.bio = bio.slice(0, 160); user.initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); saveDb(db); return send(res, 200, publicUser(user, db)); }
    if (parts[1] === 'profile' && parts[2] === 'image' && req.method === 'POST') { const body = await readBody(req); if (!validImage(body.image)) return send(res, 400, { error: 'Choose a JPG, PNG, or WebP image under 500 KB.' }); user.profileImage = body.image || null; saveDb(db); return send(res, 200, publicUser(user, db)); }
    if (parts[1] === 'bootstrap' && req.method === 'GET') {
      const people = db.users.filter((item) => item.id !== user.id).map((item) => ({ ...publicUser(item, db), note: item.bio }));
      const conversations = db.users.filter((item) => item.id !== user.id && db.messages.some((message) => message.from === item.id && message.to === user.id || message.from === user.id && message.to === item.id)).map((item) => conversationSummary(item, user, db));
      return send(res, 200, { user: publicUser(user, db), posts: db.posts.slice().sort((a, b) => b.createdAt - a.createdAt).map((post) => decoratePost(post, db, user)), people, conversations });
    }
    if (parts[1] === 'posts' && parts.length === 2 && req.method === 'POST') {
      const body = await readBody(req); const text = String(body.text || '').trim(); if (!text || text.length > 280) return send(res, 400, { error: 'Post text must be between 1 and 280 characters.' }); if (!validImage(body.image)) return send(res, 400, { error: 'Choose a JPG, PNG, or WebP image under 500 KB.' });
      const post = { id: crypto.randomUUID(), authorId: user.id, text, image: body.image || null, likes: [], comments: [], shares: [], createdAt: Date.now() }; db.posts.push(post); saveDb(db); return send(res, 201, decoratePost(post, db, user));
    }
    if (parts[1] === 'posts' && parts[2] && parts[3] === 'edit' && req.method === 'POST') {
      const post = db.posts.find((item) => item.id === parts[2]); if (!post) return send(res, 404, { error: 'Post not found.' }); if (post.authorId !== user.id) return send(res, 403, { error: 'Only the post owner can edit it.' });
      const body = await readBody(req); const text = String(body.text || '').trim(); if (!text || text.length > 280) return send(res, 400, { error: 'Post text must be between 1 and 280 characters.' });
      post.text = text; saveDb(db); return send(res, 200, decoratePost(post, db, user));
    }
    if (parts[1] === 'posts' && parts[2] && parts[3] === 'like' && req.method === 'POST') {
      const post = db.posts.find((item) => item.id === parts[2]); if (!post) return send(res, 404, { error: 'Post not found.' }); const index = post.likes.indexOf(user.id); index === -1 ? post.likes.push(user.id) : post.likes.splice(index, 1); saveDb(db); return send(res, 200, decoratePost(post, db, user));
    }
    if (parts[1] === 'posts' && parts[2] && parts[3] === 'share' && req.method === 'POST') { const post = db.posts.find((item) => item.id === parts[2]); if (!post) return send(res, 404, { error: 'Post not found.' }); post.shares.push(user.id); saveDb(db); return send(res, 200, decoratePost(post, db, user)); }
    if (parts[1] === 'posts' && parts[2] && parts[3] === 'comments' && req.method === 'POST') { const post = db.posts.find((item) => item.id === parts[2]); const body = await readBody(req); const text = String(body.text || '').trim(); if (!post || !text || text.length > 280) return send(res, 400, { error: 'Comment must be between 1 and 280 characters.' }); post.comments.push({ id: crypto.randomUUID(), authorId: user.id, text, createdAt: Date.now() }); saveDb(db); return send(res, 201, decoratePost(post, db, user)); }
    if (parts[1] === 'users' && parts[2] && parts[3] === 'follow' && req.method === 'POST') { const target = db.users.find((item) => item.handle === `@${parts[2].replace(/^@/, '')}`); if (!target || target.id === user.id) return send(res, 400, { error: 'That account cannot be followed.' }); const index = user.following.indexOf(target.id); index === -1 ? (user.following.push(target.id), target.followers.push(user.id)) : (user.following.splice(index, 1), target.followers.splice(target.followers.indexOf(user.id), 1)); saveDb(db); return send(res, 200, publicUser(target, db)); }
    if (parts[1] === 'conversations' && parts[2] && parts[3] === 'messages' && req.method === 'GET') { const other = db.users.find((item) => item.handle === `@${parts[2].replace(/^@/, '')}`); if (!other) return send(res, 404, { error: 'User not found.' }); const messages = db.messages.filter((message) => (message.from === user.id && message.to === other.id) || (message.from === other.id && message.to === user.id)).sort((a, b) => a.createdAt - b.createdAt).map((message) => ({ ...message, mine: message.from === user.id })); return send(res, 200, { other: publicUser(other, db), messages }); }
    if (parts[1] === 'conversations' && parts[2] && parts[3] === 'messages' && req.method === 'POST') { const other = db.users.find((item) => item.handle === `@${parts[2].replace(/^@/, '')}`); const body = await readBody(req); const text = String(body.text || '').trim(); if (!other || !text) return send(res, 400, { error: 'Choose a user and write a message.' }); const message = { id: crypto.randomUUID(), from: user.id, to: other.id, text, createdAt: Date.now() }; db.messages.push(message); saveDb(db); return send(res, 201, { ...message, mine: true }); }
    send(res, 404, { error: 'API route not found.' });
  } catch (error) { send(res, 500, { error: error.message }); }
}
function serveStatic(req, res, pathname) { const requested = pathname === '/' ? '/index.html' : pathname; const filePath = path.join(FRONTEND_ROOT, requested); if (!filePath.startsWith(FRONTEND_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, { error: 'Not found' }); res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' }); fs.createReadStream(filePath).pipe(res); }
http.createServer((req, res) => api(req, res, loadDb())).listen(PORT, () => console.log(`Gather is running at http://localhost:${PORT}`));
