import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import adminCatalogRoutes from './admin-catalog.routes.js';
import { requireCatalogDatabase } from './catalog.routes.js';
const router=Router();
router.get('/ping',requireCatalogDatabase,requireAuth,requireAdmin,(req,res)=>res.json({ok:true,data:{message:'Admin authorization verified'}}));
router.use(adminCatalogRoutes);
export default router;
