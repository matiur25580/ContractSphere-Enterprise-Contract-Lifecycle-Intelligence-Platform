import { Types } from "mongoose";
import { Notification } from "./notification.model.js";

const oid = (value: string) => new Types.ObjectId(value);

export async function createUserNotification(input: {
  tenantId: string; userId: string; type: string; title: string; body: string; link?: string | undefined; dedupeKey?: string | undefined;
}) {
  try {
    return await Notification.create({ ...input, tenantId: oid(input.tenantId), userId: oid(input.userId) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return null;
    throw error;
  }
}

export async function createNotificationsForUsers(input: {
  tenantId: string; userIds: string[]; type: string; title: string; body: string; link?: string | undefined; dedupeKey?: string | undefined;
}) {
  const userIds = [...new Set(input.userIds)];
  if (!userIds.length) return;
  await Notification.bulkWrite(userIds.map(userId => ({
    updateOne: {
      filter: { tenantId: oid(input.tenantId), userId: oid(userId), dedupeKey: input.dedupeKey },
      update: { $setOnInsert: { tenantId: oid(input.tenantId), userId: oid(userId), type: input.type, title: input.title, body: input.body, link: input.link, dedupeKey: input.dedupeKey } },
      upsert: true
    }
  })));
}

export async function listMyNotifications(tenantId: string, userId: string, page: number, limit: number) {
  const filter = { tenantId: oid(tenantId), userId: oid(userId) };
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null })
  ]);
  return { items, unread, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function markNotificationRead(tenantId: string, userId: string, notificationId: string) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, tenantId: oid(tenantId), userId: oid(userId), readAt: null },
    { $set: { readAt: new Date() } }, { new: true }
  ).lean();
}

export async function markAllNotificationsRead(tenantId: string, userId: string) {
  const result = await Notification.updateMany(
    { tenantId: oid(tenantId), userId: oid(userId), readAt: null },
    { $set: { readAt: new Date() } }
  );
  return { modifiedCount: result.modifiedCount };
}
