import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { hashSession } from '../utils/tokens.js';
import { env } from '../config/env.js';

export const sessionCookieOptions = { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'lax', path: '/' };
function clearInvalidSession(req, res) {
 res.set('X-Session-Expired', '1');
 res.clearCookie('tw_session', sessionCookieOptions);
 res.clearCookie('tw_cart', sessionCookieOptions);
 if (req.cookies) delete req.cookies.tw_cart;
 req.invalidSession = true;
}
/** Optional authentication never converts an account cart into a guest cart. */
export async function optionalAuth(req,res,next) {
 try {
  const raw=req.cookies?.tw_session;
  if (!raw) return next();
  if (typeof raw!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw)) { clearInvalidSession(req, res); return next(); }
  const sess=await Session.findOne({tokenHash:hashSession(raw),expiresAt:{$gt:new Date()}}).lean();
  if (!sess) { clearInvalidSession(req, res); return next(); }
  const user=await User.findById(sess.userId).select('name email role active authVersion').lean();
  if (!user?.active || (sess.authVersion || 0) !== (user.authVersion || 0)) { clearInvalidSession(req, res); return next(); }
  req.user=user;req.session=sess;next();
 } catch(err){next(err);}
}
export function requireAuth(req,res,next) {
 return optionalAuth(req, res, error => {
  if (error) return next(error);
  if (!req.user) return res.status(401).json({ok:false,error:{code:'UNAUTHORIZED',message:'Log in required. Your session may have expired.'}});
  next();
 });
}
export function requireAdmin(req,res,next){
 if(req.user?.role!=='admin') return res.status(403).json({ok:false,error:{code:'FORBIDDEN',message:'Admin access required'}});
 next();
}
