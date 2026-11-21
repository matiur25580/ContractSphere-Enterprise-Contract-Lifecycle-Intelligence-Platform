import {app} from "./app.js";
import {connectDatabase,disconnectDatabase} from "./config/database.js";
import {env} from "./config/env.js";
import { startDocumentJobWorker, stopDocumentJobWorker } from "./modules/intelligence/document-job.service.js";
import { startReminderScheduler, stopReminderScheduler } from "./modules/obligations/reminder.service.js";

try {
  await connectDatabase();
} catch (error) {
  console.error("Database startup failed:",error);
  process.exit(1);
}

const server=app.listen(env.PORT,()=>{
  console.info(`ContractSphere API listening on http://localhost:${env.PORT}`);
  if (env.MONGODB_URI) {
    startDocumentJobWorker();
    startReminderScheduler();
  }
});
let shuttingDown = false;
const shutdown=(signal:string)=>{
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received; closing services.`);
  server.close(async error=>{
    if(error){console.error("HTTP shutdown failed:",error);process.exit(1);}
    try {
      await Promise.all([stopDocumentJobWorker(), stopReminderScheduler()]);
      await disconnectDatabase();
      process.exit(0);
    }
    catch(disconnectError){console.error("Service shutdown failed:",disconnectError);process.exit(1);}
  });
};
process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("SIGTERM",()=>shutdown("SIGTERM"));
