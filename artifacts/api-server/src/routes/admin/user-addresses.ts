import { Router } from "express";
import { db } from "@workspace/db";
import { savedAddressesTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { sendSuccess, sendNotFound, sendValidationError } from "../../lib/response.js";
import { generateId, addAuditEntry, getClientIp, type AdminRequest } from "../admin-shared.js";

const router = Router();

router.get("/users/:id/addresses", async (req, res) => {
  const userId = req.params["id"]!;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { sendNotFound(res, "User not found"); return; }

  const addresses = await db
    .select()
    .from(savedAddressesTable)
    .where(eq(savedAddressesTable.userId, userId));

  sendSuccess(res, { addresses });
});

router.post("/users/:id/addresses", async (req, res) => {
  const userId = req.params["id"]!;
  const adminReq = req as AdminRequest;
  const { label, address, city, icon } = req.body as Record<string, string>;

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { sendNotFound(res, "User not found"); return; }

  if (!label?.trim()) { sendValidationError(res, "Label is required"); return; }
  if (!address?.trim()) { sendValidationError(res, "Address is required"); return; }

  const existing = await db.select({ id: savedAddressesTable.id }).from(savedAddressesTable).where(eq(savedAddressesTable.userId, userId));
  if (existing.length >= 10) { sendValidationError(res, "Maximum 10 addresses per user"); return; }

  const id = generateId();
  await db.insert(savedAddressesTable).values({
    id,
    userId,
    label: label.trim(),
    address: address.trim(),
    city: city?.trim() || "Muzaffarabad",
    icon: icon || "location-outline",
    isDefault: existing.length === 0,
  });

  addAuditEntry({ action: "admin_address_create", ip: getClientIp(req), adminId: adminReq.adminId, details: `Admin created address "${label}" for user ${userId}`, result: "success" });

  const [addr] = await db.select().from(savedAddressesTable).where(eq(savedAddressesTable.id, id)).limit(1);
  sendSuccess(res, { address: addr });
});

router.patch("/users/:id/addresses/:addressId", async (req, res) => {
  const { id: userId, addressId } = req.params as { id: string; addressId: string };
  const adminReq = req as AdminRequest;
  const { label, address, city, icon } = req.body as Record<string, string>;

  const [existing] = await db.select().from(savedAddressesTable).where(and(
    eq(savedAddressesTable.id, addressId),
    eq(savedAddressesTable.userId, userId),
  )).limit(1);
  if (!existing) { sendNotFound(res, "Address not found"); return; }

  const updates: Partial<typeof savedAddressesTable.$inferInsert> = {};
  if (label?.trim()) updates.label = label.trim();
  if (address?.trim()) updates.address = address.trim();
  if (city !== undefined && city.trim()) updates.city = city.trim();
  if (icon !== undefined) updates.icon = icon;

  if (Object.keys(updates).length === 0) { sendValidationError(res, "No fields to update"); return; }

  await db.update(savedAddressesTable).set(updates).where(eq(savedAddressesTable.id, addressId));
  addAuditEntry({ action: "admin_address_update", ip: getClientIp(req), adminId: adminReq.adminId, details: `Admin updated address ${addressId} for user ${userId}`, result: "success" });

  const [addr] = await db.select().from(savedAddressesTable).where(eq(savedAddressesTable.id, addressId)).limit(1);
  sendSuccess(res, { address: addr });
});

router.delete("/users/:id/addresses/:addressId", async (req, res) => {
  const { id: userId, addressId } = req.params as { id: string; addressId: string };
  const adminReq = req as AdminRequest;

  const [existing] = await db.select().from(savedAddressesTable).where(and(
    eq(savedAddressesTable.id, addressId),
    eq(savedAddressesTable.userId, userId),
  )).limit(1);
  if (!existing) { sendNotFound(res, "Address not found"); return; }

  await db.delete(savedAddressesTable).where(eq(savedAddressesTable.id, addressId));
  addAuditEntry({ action: "admin_address_delete", ip: getClientIp(req), adminId: adminReq.adminId, details: `Admin deleted address ${addressId} for user ${userId}`, result: "success" });

  sendSuccess(res, { deleted: true });
});

export default router;
