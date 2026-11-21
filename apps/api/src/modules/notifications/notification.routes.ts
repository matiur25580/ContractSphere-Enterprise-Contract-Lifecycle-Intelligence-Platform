import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/async-handler.js";
import { HttpError } from "../../common/http-error.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { listMyNotifications, markAllNotificationsRead, markNotificationRead } from "./notification.service.js";

export const notificationRouter = Router();
notificationRouter.use(requireAuth);
const idParam = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new HttpError(400, "Invalid notification identifier.", "INVALID_ID");
  return value;
};
notificationRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }).safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Invalid notification query.", "VALIDATION_ERROR");
  const result = await listMyNotifications(req.auth!.tenantId, req.auth!.userId, parsed.data.page, parsed.data.limit);
  res.json({ success: true, data: result });
}));
notificationRouter.patch("/read-all", asyncHandler(async (req, res) => {
  const result = await markAllNotificationsRead(req.auth!.tenantId, req.auth!.userId);
  res.json({ success: true, data: result });
}));
notificationRouter.patch("/:notificationId/read", asyncHandler(async (req, res) => {
  const notification = await markNotificationRead(req.auth!.tenantId, req.auth!.userId, idParam(req.params.notificationId));
  if (!notification) throw new HttpError(404, "Unread notification not found.", "NOTIFICATION_NOT_FOUND");
  res.json({ success: true, data: { notification } });
}));
