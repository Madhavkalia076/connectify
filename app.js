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
const mongoose=require('mongoose');
const session=require('express-session');
const { MongoStore }=require('connect-mongo');

const http=require('http');
const server=http.createServer(app);
const socketIO=require('socket.io');
const io=socketIO(server);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// The session middleware itself — one instance, shared between Express (HTTP) and Socket.io
// (WebSocket) below, so a logged-in user's identity is visible in both worlds.
const sessionMiddleware=session({
  secret: process.env.SESSION_SECRET,
  resave: false,            // don't re-save a session to the store if nothing changed
  saveUninitialized: false, // don't create a session record for anonymous visitors who never log in
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }), // persists sessions across server restarts
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});

app.use(sessionMiddleware);
// Socket.io v4.6+ lets its underlying engine run Express-style middleware directly, so every
// socket connection goes through the same session logic as a normal HTTP request.
io.engine.use(sessionMiddleware);

let waitingusers=[];
let rooms={

}

io.on("connection",function(socket){
  // socket.request went through sessionMiddleware above (via io.engine.use), so it carries the
  // same req.session an HTTP request would have. No session username = never logged in = kick them.
  const username=socket.request.session.username;
  if(!username){
    socket.disconnect(true);
    return;
  }

  socket.on("joinroom",function(){
    if(waitingusers.length > 0){
       let partner=waitingusers.shift();
       const roomname=`${socket.id}-${partner.id}`;
       socket.join(roomname);
       partner.join(roomname);
       io.to(roomname).emit("joined",roomname);
    }
    else{
      waitingusers.push(socket);
    }
  });

  socket.on("signalingMessage",function(data){
    socket.broadcast.to(data.room).emit("signalingMessage",data.message)
  })

  socket.on("message",function(data){
    socket.broadcast.to(data.room).emit("message",data.message)
  })

  socket.on("startVideoCall",function({room}){
    socket.broadcast.to(room).emit("incomingCall")
  })

  socket.on("rejectCall",function({room}){
    socket.broadcast.to(room).emit("callRejected");
  })

  socket.on("acceptCall",function({room}){
    socket.broadcast.to(room).emit("callAccepted");
  })

  socket.on("disconnect",function(){
   let index= waitingusers.findIndex(
    (waitingUser) => waitingUser.id === socket.id
  );

    waitingusers.splice(index,1);
  })
})  //iss function mey bnde ki details/data ayegi

app.set('view engine','ejs');
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

app.use('/',indexRouter);
app.use('/',authRouter);

server.listen(process.env.PORT || 3000);