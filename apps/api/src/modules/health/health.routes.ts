import {Router} from "express";
export const healthRouter=Router();
healthRouter.get("/",(_req,res)=>res.status(200).json({success:true,data:{status:"ok",service:"contractsphere-api",timestamp:new Date().toISOString()}}));
