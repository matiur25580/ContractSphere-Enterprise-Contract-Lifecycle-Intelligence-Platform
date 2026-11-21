import type {ErrorRequestHandler} from "express";
import {HttpError} from "./http-error.js";
export const errorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{
  const known=error instanceof HttpError;
  const statusCode=known?error.statusCode:500;
  if(!known) console.error(error);
  res.status(statusCode).json({success:false,error:{code:known?error.code:"INTERNAL_SERVER_ERROR",message:known?error.message:"An unexpected error occurred."}});
};
