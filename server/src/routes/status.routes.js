import { Router } from 'express';
import { env } from '../config/env.js';
const router=Router();
router.get('/status',(req,res)=>res.json({ok:true,data:{service:'tapandwrap-api',version:'0.1.0-js',checkoutEnabled:env.checkoutEnabled,phase:'foundation'}}));
export default router;
