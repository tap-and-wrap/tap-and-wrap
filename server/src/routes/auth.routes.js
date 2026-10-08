import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { env, assertAuthConfig } from '../config/env.js';
import { newSessionToken, hashSession, makeCsrfToken } from '../utils/tokens.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCatalogDatabase } from './catalog.routes.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { captureAction } from '../tracking/service.js';

const router=Router();
const authRateLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
const signupSchema=z.object({name:z.string().trim().min(2).max(100),email:z.email().max(254),password:z.string().min(12).max(128)}).strict();
const loginSchema=z.object({email:z.email(),password:z.string().min(1)}).strict();
const cookieOptions={httpOnly:true,secure:env.nodeEnv==='production',sameSite:'lax',path:'/'};
function setSessionCookie(res,token){res.cookie('tw_session',token,{...cookieOptions,maxAge:7*24*60*60*1000});}
async function createSession(res,userId,authVersion=0){
 const token=newSessionToken();
 assertDatabaseWriteAllowed(Session.db,env);
 await Session.create({tokenHash:hashSession(token),userId,authVersion,expiresAt:new Date(Date.now()+7*24*60*60*1000)});
 setSessionCookie(res,token);
}
router.get('/csrf',(req,res,next)=>{
 try {assertAuthConfig();const token=makeCsrfToken(env.sessionSecret);res.cookie('tw_csrf',token,{...cookieOptions,maxAge:24*60*60*1000});res.json({ok:true,data:{csrfToken:token}});} catch(e){next(e);}
});
router.post('/signup',authRateLimit,csrfProtection,async(req,res,next)=>{
 try {
  const values=signupSchema.parse(req.body);
  const email=values.email.toLowerCase().trim();
  const existing=await User.exists({email});
  if(existing)return res.status(409).json({ok:false,error:{code:'EMAIL_EXISTS',message:'Email already registered'}});
  const passwordHash=await bcrypt.hash(values.password,12);
  // Fixed server-side role — NEVER trust a client-supplied role.
  assertDatabaseWriteAllowed(User.db,env);
  const user=await User.create({name:values.name,email,passwordHash,role:'customer'});
  await createSession(res,user._id,user.authVersion);
  res.status(201).json({ok:true,data:{user:{id:String(user.id),name:user.name,email:user.email,role:'customer'},tracking:await captureAction(req,'CompleteRegistration',{}, {sourcePath:'/',dedupKey:String(user._id)})}});
 } catch(e){next(e);}
});
router.post('/login',authRateLimit,csrfProtection,async(req,res,next)=>{
 try {
  const values=loginSchema.parse(req.body);
  const user=await User.findOne({email:values.email.toLowerCase().trim(),active:true}).select('+passwordHash');
  if(!user||!(await bcrypt.compare(values.password,user.passwordHash)))return res.status(401).json({ok:false,error:{code:'BAD_CREDENTIALS',message:'Invalid email or password'}});
  await createSession(res,user._id,user.authVersion);
  res.json({ok:true,data:{user:{id:String(user.id),name:user.name,email:user.email,role:user.role}}});
 } catch(e){next(e);}
});
router.get('/me',requireCatalogDatabase,requireAuth,(req,res)=>res.json({ok:true,data:{user:{id:String(req.user._id),name:req.user.name,email:req.user.email,role:req.user.role}}}));
router.post('/logout',csrfProtection,requireAuth,async(req,res,next)=>{
 try {assertDatabaseWriteAllowed(Session.db,env);await Session.deleteOne({_id:req.session._id});res.clearCookie('tw_session',cookieOptions);res.json({ok:true,data:{loggedOut:true}});}catch(e){next(e);}
});
export default router;
