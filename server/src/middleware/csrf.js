import { env } from '../config/env.js';
import { validCsrfToken } from '../utils/tokens.js';
const MUTATIONS=new Set(['POST','PUT','PATCH','DELETE']);
export function csrfProtection(req,res,next) {
 if (!MUTATIONS.has(req.method)) return next();
 if (req.headers.origin !== env.clientOrigin) {
  return res.status(403).json({ok:false,error:{code:'INVALID_ORIGIN',message:'Request origin rejected'}});
 }
 const supplied=req.headers['x-csrf-token'];
 const cookie=req.cookies?.tw_csrf;
 if (typeof supplied!=='string'||supplied!==cookie||!validCsrfToken(supplied,env.sessionSecret)) {
  return res.status(403).json({ok:false,error:{code:'INVALID_CSRF',message:'CSRF validation failed'}});
 }
 next();
}
