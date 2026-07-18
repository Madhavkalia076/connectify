require('dotenv').config(); // loads .env into process.env — must run before anything reads process.env

// Windows + Node sometimes fails to resolve the mongodb+srv:// DNS SRV record even though the
// OS resolver works fine (a known Node/Windows quirk, not an Atlas problem). Pointing Node's own
// DNS client at Google's public DNS works around it.
require('dns').setServers(['8.8.8.8', '8.8.4.4']);

const express=require('express')
const app=express();
const path=require('path');
const indexRouter=require('./routes/indexroute')
const authRouter=require('./routes/authroute')
const chatRouter=require('./routes/chatroute')
const mongoose=require('mongoose');
const session=require('express-session');
const { MongoStore }=require('connect-mongo');
const Message=require('./models/Message');
const Room=require('./models/Room');

const http=require('http');
const server=http.createServer(app);
const socketIO=require('socket.io');
const io=socketIO(server);

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

io.on("connection",function(socket){
  // socket.request went through sessionMiddleware above (via io.engine.use), so it carries the
  // same req.session an HTTP request would have. No session username = never logged in = kick them.
  const username=socket.request.session.username;
  if(!username){
    socket.disconnect(true);
    return;
  }

  // Named rooms replace the old random-pairing queue: the client already knows which room it's
  // in (chosen on the /chat/:roomId page), so joining is just "put this socket in that room."
  socket.on("joinroom",function({ roomId }){
    socket.join(roomId);
  });

  socket.on("signalingMessage",function(data){
    socket.broadcast.to(data.room).emit("signalingMessage",data.message)
  })

  socket.on("message",async function(data){
    // Save first, then broadcast — this way the message only ever shows up on someone's screen
    // if it's already durably stored. If the DB write fails, nobody sees a message that would've
    // vanished on refresh anyway.
    const saved=await Message.create({ username, roomId: data.room, text: data.text });
    // io.to (not socket.broadcast.to) includes the sender too — with multiple people per room,
    // the client tells "my own message" apart from others by comparing usernames, not by relying
    // on the server to skip the sender.
    io.to(data.room).emit("message",{ username: saved.username, text: saved.text });
  })

  socket.on("startVideoCall",function({room}){
    socket.broadcast.to(room).emit("incomingCall",{ from: username })
  })

  socket.on("rejectCall",function({room}){
    socket.broadcast.to(room).emit("callRejected");
  })

  socket.on("acceptCall",function({room}){
    socket.broadcast.to(room).emit("callAccepted");
  })
})

app.set('view engine','ejs');
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

app.use('/',indexRouter);
app.use('/',authRouter);
app.use('/',chatRouter);

server.listen(process.env.PORT || 3000);