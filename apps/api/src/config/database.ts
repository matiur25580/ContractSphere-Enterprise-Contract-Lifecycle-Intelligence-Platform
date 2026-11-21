import mongoose from "mongoose";
import {env} from "./env.js";

export async function connectDatabase():Promise<void>{
  if(!env.MONGODB_URI){
    console.warn("MONGODB_URI is not configured; starting in API-only mode.");
    return;
  }
  mongoose.set("strictQuery",true);
  await mongoose.connect(env.MONGODB_URI,{serverSelectionTimeoutMS:5000});
  console.info("MongoDB connection established.");
}

export async function disconnectDatabase():Promise<void>{
  if(mongoose.connection.readyState!==0) await mongoose.disconnect();
}
