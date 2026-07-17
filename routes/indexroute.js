const express=require('express')
const router=express.Router();
const requireAuth=require('../middleware/requireAuth');

router.get('/',(req,res)=>{
   res.render("index", { username: req.session.username || null });
})

router.get('/chat',requireAuth,(req,res)=>{
  res.render("chat",{ username: req.session.username });
})

module.exports=router