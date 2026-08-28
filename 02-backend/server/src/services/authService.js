import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/appConfig.js";
import { authRequired, conflict, forbidden, validationError } from "../errors/appError.js";
import * as authRepository from "../repositories/authRepository.js";
import { listBranchesForUser } from "../repositories/branchRepository.js";
import { loginSchema, registerSchema, switchRestaurantSchema, validate } from "../validation/schemas.js";

export const roleRank = { viewer: 1, branch_manager: 2, owner: 3 };

export function signContext(context) {
  return jwt.sign(
    {
      ownerId: context.owner_id,
      restaurantId: context.restaurant_id,
      organizationId: context.organization_id,
      role: context.role
    },
    config.jwt.secret,
    { algorithm: "HS256", expiresIn: config.jwt.expiresIn, issuer: config.jwt.issuer, audience: config.jwt.audience }
  );
}

export function serializeMe(user) {
  return {
    user: { id: user.owner_id, email: user.email, name: user.name, role: user.role },
    organization: {
      id: user.organization_id,
      name: user.organization_name,
      currency: user.currency,
      timezone: user.timezone,
      language: user.language
    },
    restaurant: { id: user.restaurant_id, name: user.restaurant_name },
    branches: listBranchesForUser(user)
  };
}

export function authenticateBearerHeader(authHeader = "") {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) throw authRequired();
  let token;
  try {
    token = jwt.verify(match[1], config.jwt.secret, {
      algorithms: ["HS256"],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      clockTolerance: 5
    });
  } catch {
    throw authRequired();
  }
  if (
    !Number.isInteger(token.ownerId) ||
    !Number.isInteger(token.organizationId) ||
    !Number.isInteger(token.restaurantId)
  )
    throw authRequired();
  const context = authRepository.getAuthContext(token.ownerId, token.organizationId, token.restaurantId);
  if (!context) throw authRequired();
  // Server-side logout (M3): reject tokens issued before the owner's last
  // logout instead of letting them stay valid for the full 12-hour lifetime.
  if (context.token_invalid_before && token.iat < context.token_invalid_before) throw authRequired();
  return context;
}

export function logout(user) {
  if (user?.owner_id) authRepository.invalidateOwnerTokens(user.owner_id);
  return { ok: true };
}

export function register(body) {
  const parsed = validate(registerSchema, body);
  if (authRepository.isEmailRegistered(parsed.email)) throw conflict("Email is already registered.");
  const context = authRepository.createRegistration(parsed, bcrypt.hashSync(parsed.password, config.bcryptCost));
  return { token: signContext(context), ...serializeMe(context) };
}

export function login(body) {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) throw validationError("Valid email and password are required");
  const owner = authRepository.findOwnerByEmail(parsed.data.email);
  if (!owner || !bcrypt.compareSync(parsed.data.password, owner.password_hash)) throw authRequired();
  // When an explicit organization or restaurant is requested, verify it with
  // the strict membership lookup (no legacy fallback): a foreign or invalid
  // id is rejected instead of silently logging into the owner's first
  // restaurant. Default login (no target) keeps its existing behavior.
  const explicitTarget = parsed.data.organizationId || parsed.data.restaurantId;
  const context = explicitTarget
    ? authRepository.findMembershipContext(owner.id, parsed.data.organizationId, parsed.data.restaurantId)
    : authRepository.getAuthContext(owner.id, null, null);
  if (!context) throw forbidden("No access to that organization or restaurant");
  return {
    token: signContext(context),
    restaurant: { id: context.restaurant_id, name: context.restaurant_name },
    ...serializeMe(context)
  };
}

// Switch the current session to another restaurant inside the same
// organization (H4): membership is re-verified from the database with the
// strict (non-legacy) lookup — a foreign organization's restaurant is
// rejected instead of silently falling back to the first restaurant.
export function switchRestaurant(user, body) {
  const parsed = validate(switchRestaurantSchema, body);
  const context = authRepository.findMembershipContext(user.owner_id, user.organization_id, parsed.restaurantId);
  if (!context) throw forbidden("No access to that restaurant");
  return {
    token: signContext(context),
    restaurant: { id: context.restaurant_id, name: context.restaurant_name },
    ...serializeMe(context)
  };
}

export function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

export { authRepository };
