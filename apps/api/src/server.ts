import {app} from "./app.js";
import {env} from "./config/env.js";
const server=app.listen(env.PORT,()=>console.info(`ContractSphere API listening on http://localhost:${env.PORT}`));
const shutdown=(signal:string)=>{console.info(`${signal} received; closing HTTP server.`);server.close(error=>{if(error){console.error("Graceful shutdown failed:",error);process.exit(1);}process.exit(0);});};
process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("SIGTERM",()=>shutdown("SIGTERM"));
