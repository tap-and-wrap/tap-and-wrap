import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/db.js';
await connectDatabase();
app.listen(env.port,()=>console.log(`Tap & Wrap JS API listening at http://localhost:${env.port}`));
