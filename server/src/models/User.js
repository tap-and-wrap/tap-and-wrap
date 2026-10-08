import mongoose from 'mongoose';
const schema = new mongoose.Schema({
 name:{type:String,required:true,trim:true,maxlength:100},
 email:{type:String,required:true,lowercase:true,trim:true,maxlength:254},
 passwordHash:{type:String,required:true,select:false},
 role:{type:String,enum:['customer','admin'],default:'customer',required:true},
 active:{type:Boolean,default:true},
 emailVerifiedAt:{type:Date,default:null},
 authVersion:{type:Number,default:0,min:0,validate:Number.isSafeInteger},
},{timestamps:true});
schema.index({email:1},{unique:true});
schema.index({role:1,createdAt:-1,_id:-1});
schema.index({role:1,name:1,_id:1});
export const User=mongoose.model('User',schema);
