import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { isDatabaseReady } from './config/db.js';
import { env } from './config/env.js';
import { assertDatabaseWriteAllowed, DatabaseSafetyError } from './config/database-safety.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import statusRoutes from './routes/status.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import { commerceRoutes, adminCommerceRoutes } from './commerce/routes.js';
import { adminConfigurationRoutes } from './commerce/configuration.routes.js';
import accountRoutes from './routes/account.routes.js';
import { publicWebsiteRouter, adminWebsiteRouter } from './website/routes.js';
import trackingRoutes from './tracking/routes.js';

export const app=express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({origin:env.clientOrigin,credentials:true}));
app.use(express.json({limit:'100kb'}));
app.use(cookieParser());
app.use(['/api/v1/admin', '/api/v1/auth'], (req, res, next) => {
 res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
 res.set('Cache-Control', 'private, no-store');
 res.vary('Cookie');
 next();
});
app.get('/health/live',(req,res)=>res.status(200).json({ok:true,data:{status:'alive'}}));
app.get('/health/ready',(req,res)=>res.status(isDatabaseReady()?200:503).json({ok:isDatabaseReady(),data:{database:isDatabaseReady()?'connected':'not_connected'}}));
app.use('/api/v1',statusRoutes);
app.use('/api/v1', (req, res, next) => {
 if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
 try { assertDatabaseWriteAllowed(mongoose.connection, env); next(); } catch (error) { next(error); }
});
app.use('/api/v1/auth',accountRoutes,authRoutes);
app.use('/api/v1/public',publicWebsiteRouter);
app.use('/api/v1/public',catalogRoutes);
app.use('/api/v1/tracking',trackingRoutes);
app.use('/api/v1/admin/website',adminWebsiteRouter);
app.use('/api/v1/commerce', commerceRoutes);
app.use('/api/v1/admin/commerce', adminCommerceRoutes, adminConfigurationRoutes);
app.use('/api/v1/admin',adminRoutes);
app.use((req,res)=>res.status(404).json({ok:false,error:{code:'NOT_FOUND',message:'Route not found'}}));
app.use((err,req,res,next)=>{
 if(err instanceof DatabaseSafetyError)return res.status(503).json({ok:false,error:{code:err.code,message:err.message}});
 if(err?.status===503)return res.status(503).json({ok:false,error:{code:typeof err.code==='string'&&/^[A-Z0-9_]+$/.test(err.code)?err.code:'COMMERCE_UNAVAILABLE',message:'Commerce infrastructure is unavailable. Please try again later; no successful purchase is being reported.'}});
 if(err instanceof ZodError)return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR',message:'Invalid request',details:err.issues.map(x=>({field:x.path.join('.'),message:x.message}))}});
 if(err?.code===11000)return res.status(409).json({ok:false,error:{code:'CONFLICT',message:'Record already exists'}});
 if(err instanceof mongoose.Error.ValidationError)return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR',message:'Invalid catalog record',details:Object.values(err.errors).map(x=>({field:x.path,message:x.message}))}});
 if(err instanceof mongoose.Error.CastError||err instanceof mongoose.Error.StrictModeError)return res.status(400).json({ok:false,error:{code:'VALIDATION_ERROR',message:'Invalid catalog value'}});
 if(err instanceof mongoose.Error.VersionError)return res.status(409).json({ok:false,error:{code:'CONFLICT',message:'The record changed. Reload it before editing.'}});
 if(err?.status>=400&&err.status<500)return res.status(err.status).json({ok:false,error:{code:err.code||'INVALID_REQUEST',message:err.message,...(Array.isArray(err.details)?{details:err.details.filter(x=>typeof x?.field==='string'&&typeof x?.message==='string').map(x=>({field:x.field,message:x.message}))}:{})}});
 if(err instanceof SyntaxError&&'body' in err)return res.status(400).json({ok:false,error:{code:'INVALID_JSON',message:'Malformed JSON'}});
 // Driver exceptions can contain connection strings. Never echo their text.
 console.error('Request failed. Internal details redacted.');
 return res.status(500).json({ok:false,error:{code:'SERVER_ERROR',message:'Unexpected server error'}});
});
