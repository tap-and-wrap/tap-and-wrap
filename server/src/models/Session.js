import mongoose from 'mongoose';
const schema = new mongoose.Schema({
 tokenHash:{type:String,required:true,unique:true},
 userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 authVersion:{type:Number,default:0,min:0,validate:Number.isSafeInteger},
 expiresAt:{type:Date,required:true},
},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export const Session=mongoose.model('Session',schema);
