import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { hashSession } from '../utils/tokens.js';
export async function requireAuth(req,res,next) {
 try {
  const raw=req.cookies?.tw_session;
  if (typeof raw!=='string'||raw.length<32) return res.status(401).json({ok:false,error:{code:'UNAUTHORIZED',message:'Log in required'}});
  const sess=await Session.findOne({tokenHash:hashSession(raw),expiresAt:{$gt:new Date()}}).lean();
  if (!sess) return res.status(401).json({ok:false,error:{code:'UNAUTHORIZED',message:'Session expired'}});
  const user=await User.findById(sess.userId).select('name email role active authVersion').lean();
  if (!user?.active) return res.status(401).json({ok:false,error:{code:'UNAUTHORIZED',message:'Account unavailable'}});
  if ((sess.authVersion || 0) !== (user.authVersion || 0)) return res.status(401).json({ok:false,error:{code:'UNAUTHORIZED',message:'Sign in again after your password changed'}});
  req.user=user;req.session=sess;next();
 } catch(err){next(err);}
}
export function requireAdmin(req,res,next){
 if(req.user?.role!=='admin') return res.status(403).json({ok:false,error:{code:'FORBIDDEN',message:'Admin access required'}});
 next();
}
