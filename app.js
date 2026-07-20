require('dotenv').config(); // loads .env into process.env — must run before anything reads process.env

// Windows + Node sometimes fails to resolve the mongodb+srv:// DNS SRV record even though the
// OS resolver works fine (a known Node/Windows quirk, not an Atlas problem). Pointing Node's own
// DNS client at Google's public DNS works around it.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const express=require('express')
const app=express();
const path=require('path');
const fs=require('fs');

// uploads/ is gitignored, so a fresh clone won't have it — git doesn't track empty directories.
// Create it on startup so the first image upload doesn't crash looking for a folder that was
// never there.
const uploadsDir=path.join(__dirname,"uploads");
if(!fs.existsSync(uploadsDir)){
  fs.mkdirSync(uploadsDir);
}
const indexRouter=require('./routes/indexroute')
const authRouter=require('./routes/authroute')
const chatRouter=require('./routes/chatroute')
const messageRouter=require('./routes/messageroute')
const dmRouter=require('./routes/dmroute')
const profileRouter=require('./routes/profileroute')
const mongoose=require('mongoose');
const session=require('express-session');
const { MongoStore }=require('connect-mongo');
const Message=require('./models/Message');
const Room=require('./models/Room');
const Conversation=require('./models/Conversation');
const { isDmRoomId, getDmParticipants }=require('./lib/dm');

const http=require('http');
const server=http.createServer(app);
const socketIO=require('socket.io');
const io=socketIO(server);
// Lets HTTP routes (like the image upload route in chatroute.js) reach the same io instance to
// broadcast, without a separate module needing its own require('socket.io') / circular import.
app.set('io', io);

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    // upsert: create "general" only if it doesn't already exist, so restarting the server never
    // duplicates it or wipes out rooms users have since created.
    await Room.updateOne({ name: 'general' }, { $setOnInsert: { name: 'general', createdBy: 'system' } }, { upsert: true });
  })
  .catch((err) => console.error("MongoDB connection error:", err.message));

// mongoose.connect().catch() only covers the *initial* connection attempt — once connected, a
// dropped connection (network blip, Atlas hiccup) surfaces as an 'error' event instead. Without
// this listener, that event has no handler and Node treats it as an unhandled error, crashing the
// whole process over what should just be a logged, recoverable blip.
mongoose.connection.on('error', (err) => {
  console.error("MongoDB connection error (post-connect):", err.message);
});

// The session store keeps its own separate MongoDB connection (independent of mongoose.connect()
// above). connect-mongo never attaches a .catch() to that connection's own promise internally, so
// if it rejects (Atlas hiccup, etc.) with nothing consuming it, Node treats it as an unhandled
// rejection and kills the whole process. sessionStore.clientP is that underlying promise — we
// catch it directly so a store-side connection failure is just logged, not fatal.
const sessionStore = MongoStore.create({ mongoUrl: process.env.MONGODB_URI });
sessionStore.clientP.catch((err) => {
  console.error("Session store MongoDB error:", err.message);
});

// The session middleware itself — one instance, shared between Express (HTTP) and Socket.io
// (WebSocket) below, so a logged-in user's identity is visible in both worlds.
const sessionMiddleware=session({
  secret: process.env.SESSION_SECRET,
  resave: false,            // don't re-save a session to the store if nothing changed
  saveUninitialized: false, // don't create a session record for anonymous visitors who never log in
  store: sessionStore, // persists sessions across server restarts
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

app.use(sessionMiddleware);
// Socket.io v4.6+ lets its underlying engine run Express-style middleware directly, so every
// socket connection goes through the same session logic as a normal HTTP request.
io.engine.use(sessionMiddleware);

// Presence: roomId -> Map<username, Set<socket.id>>. A Set of socket IDs per username (not just a
// count) means the same person joining from two tabs/devices doesn't wrongly disappear from the
// "online" list the moment they close just one of them — they only leave once *every* socket of
// theirs in that room is gone.
// Known limitation, same as the old matchmaking queue: this lives in server RAM, so it resets on
// restart and wouldn't stay in sync across multiple server instances without a shared store like
// Redis. Fine for a single-instance deployment, worth knowing the ceiling.
const roomPresence = new Map();

function addPresence(roomId, username, socketId) {
  if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
  const usersInRoom = roomPresence.get(roomId);
  if (!usersInRoom.has(username)) usersInRoom.set(username, new Set());
  usersInRoom.get(username).add(socketId);
}

function removePresence(roomId, username, socketId) {
  const usersInRoom = roomPresence.get(roomId);
  if (!usersInRoom || !usersInRoom.has(username)) return;
  const sockets = usersInRoom.get(username);
  sockets.delete(socketId);
  if (sockets.size === 0) usersInRoom.delete(username);
  if (usersInRoom.size === 0) roomPresence.delete(roomId);
}

function broadcastPresence(roomId) {
  const usersInRoom = roomPresence.get(roomId);
  const usernames = usersInRoom ? Array.from(usersInRoom.keys()) : [];
  // roomId travels with the payload because, since unread badges started listening to every room
  // a user can see over one shared connection, a client can no longer assume "any presence event
  // I receive must be for the room I'm currently looking at."
  io.to(roomId).emit("presence", { roomId, usernames });
}

// Membership check shared by "joinroom" and "watchRoom" below — both need to confirm the socket's
// user is actually allowed into this room before letting Socket.io group them into it.
async function canAccessRoom(roomId, username) {
  // DM roomIds encode their own membership (the two usernames baked into the string itself), so
  // there's no document to look up — just check the requester is one of the two people it names.
  if (isDmRoomId(roomId)) {
    return getDmParticipants(roomId).includes(username);
  }
  const room = await Room.findOne({ name: roomId });
  if (!room) return false;
  if (room.requiresApproval && room.createdBy !== username && !room.members.includes(username)) {
    return false;
  }
  return true;
}

// Lets HTTP routes (chatroute.js's participants list) read live presence data without needing
// their own reference to the roomPresence Map, which only exists in this module's scope.
app.set('getOnlineUsers', function (roomId) {
  const usersInRoom = roomPresence.get(roomId);
  return usersInRoom ? Array.from(usersInRoom.keys()) : [];
});

io.on("connection",function(socket){
  // socket.request went through sessionMiddleware above (via io.engine.use), so it carries the
  // same req.session an HTTP request would have. No session username = never logged in = kick them.
  const username=socket.request.session.username;
  if(!username){
    socket.disconnect(true);
    return;
  }

  // Tracked per-connection (not looked up from socket.rooms) because we need to know exactly
  // which room to clean up presence for when this socket disconnects.
  let joinedRoom=null;

  // Named rooms replace the old random-pairing queue: the client already knows which room it's
  // in (chosen on the /chat/:roomId page), so joining is just "put this socket in that room."
  // This is specifically for the room the user is *actively viewing* — it's the only join that
  // affects presence (the "Online: ..." bar and the Room Info participant list).
  socket.on("joinroom",async function({ roomId }){
    // Defense in depth, same reasoning as the session check above: the /chat/:roomId page already
    // blocks non-members of an approval-required room from ever seeing the chat UI, but nothing
    // stops someone from opening a raw socket connection and emitting "joinroom" directly for a
    // room they were never approved for. Checking membership again here closes that gap.
    if(!(await canAccessRoom(roomId, username))) return;

    socket.join(roomId);
    joinedRoom=roomId;
    addPresence(roomId, username, socket.id);
    broadcastPresence(roomId);
  });

  // Joins a room's broadcast channel *without* presence tracking — used by the sidebar to receive
  // live "message" events (for unread badges) from every room a user can see, without falsely
  // making them appear "online" in rooms they're not actually viewing. A user can be watching many
  // rooms at once but only ever actively present ("joinroom") in one.
  socket.on("watchRoom",async function({ roomId }){
    if(!(await canAccessRoom(roomId, username))) return;
    socket.join(roomId);
  });

  // Relayed straight to everyone else in the room, no debounce logic needed server-side — the
  // client already debounces how often it sends these (see chat.ejs). room travels with the
  // payload so a client watching multiple rooms at once can tell this apart from a background one.
  socket.on("typing",function({room}){
    socket.broadcast.to(room).emit("typing",{ username, room });
  });

  socket.on("disconnect",function(){
    if(joinedRoom){
      removePresence(joinedRoom, username, socket.id);
      broadcastPresence(joinedRoom);
    }
  });

  socket.on("signalingMessage",function(data){
    socket.broadcast.to(data.room).emit("signalingMessage",{ room: data.room, message: data.message })
  })

  socket.on("message",async function(data){
    // Save first, then broadcast — this way the message only ever shows up on someone's screen
    // if it's already durably stored. If the DB write fails, nobody sees a message that would've
    // vanished on refresh anyway.
    const saved=await Message.create({ username, roomId: data.room, text: data.text });

    // Bumps the conversation's updatedAt so the DM sidebar list can sort "most recently active
    // first" — doesn't matter for room chat, which has no equivalent sidebar ordering need.
    if(isDmRoomId(data.room)){
      await Conversation.updateOne({ participants: getDmParticipants(data.room) }, { $currentDate: { updatedAt: true } });
    }

    // io.to (not socket.broadcast.to) includes the sender too — with multiple people per room,
    // the client tells "my own message" apart from others by comparing usernames, not by relying
    // on the server to skip the sender. The id lets the client later target this exact message for
    // deletion (delete-for-me / delete-for-everyone). room lets a client watching several rooms at
    // once (for unread badges) tell which one this belongs to.
    io.to(data.room).emit("message",{ id: saved._id.toString(), username: saved.username, text: saved.text, room: data.room });
  })

  socket.on("startVideoCall",function({room}){
    socket.broadcast.to(room).emit("incomingCall",{ from: username, room })
  })

  socket.on("rejectCall",function({room}){
    socket.broadcast.to(room).emit("callRejected",{ room });
  })

  socket.on("acceptCall",function({room}){
    socket.broadcast.to(room).emit("callAccepted",{ room });
  })

  // Lets the caller back out of a call before the other side has responded — without this, the
  // callee's incoming-call popup (and ringtone) would just sit there indefinitely with no signal
  // that the caller gave up.
  socket.on("cancelCall",function({room}){
    socket.broadcast.to(room).emit("callCancelled",{ room });
  })
})

app.set('view engine','ejs');
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));
// Serves uploaded images back out at /uploads/<filename>. Known limitation, stated honestly: this
// is local disk storage, which doesn't survive a redeploy on most free hosts (Render's free tier
// wipes the filesystem on every deploy) — fine for local dev/demo, would need S3/Cloudinary for a
// production deployment that needs uploads to actually persist.
app.use('/uploads', express.static(path.join(__dirname, "uploads")));

app.use('/',indexRouter);
app.use('/',authRouter);
app.use('/',chatRouter);
app.use('/',messageRouter);
app.use('/',dmRouter);
app.use('/',profileRouter);

server.listen(process.env.PORT || 3000);