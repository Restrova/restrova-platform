import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/appConfig.js";
import { authRequired, conflict, forbidden, validationError } from "../errors/appError.js";
import * as authRepository from "../repositories/authRepository.js";
import { listBranchesForUser } from "../repositories/branchRepository.js";
import { emailAvailabilitySchema, loginSchema, registerSchema, validate } from "../validation/schemas.js";

export const roleRank = { viewer: 1, branch_manager: 2, owner: 3 };

export function signContext(context) {
  const sessionId = crypto.randomUUID();
  const signedToken = jwt.sign(
    {
      ownerId: context.owner_id,
      restaurantId: context.restaurant_id,
      organizationId: context.organization_id,
      role: context.role
    },
    config.jwt.secret,
    {
      algorithm: "HS256",
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      jwtid: sessionId
    }
  );
  const { iat, exp } = jwt.decode(signedToken);
  authRepository.createAuthSession(sessionId, context, iat, exp);
  return signedToken;
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
  // Bound all token work and parse the fixed scheme without a backtracking regex.
  if (
    typeof authHeader !== "string" ||
    authHeader.length > 8192 ||
    authHeader.length <= 7 ||
    authHeader.slice(0, 7).toLowerCase() !== "bearer "
  )
    throw authRequired();
  const bearerToken = authHeader.slice(7);
  for (let index = 0; index < bearerToken.length; index++) {
    const code = bearerToken.charCodeAt(index);
    if (!(
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 45 ||
      code === 95 ||
      code === 46
    ))
      throw authRequired();
  }
  let token;
  try {
    token = jwt.verify(bearerToken, config.jwt.secret, {
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
    !Number.isInteger(token.restaurantId) ||
    typeof token.jti !== "string" ||
    !token.jti
  )
    throw authRequired();
  const session = authRepository.findActiveAuthSession(token, Math.floor(Date.now() / 1000));
  if (!session) throw authRequired();
  const context = authRepository.getAuthContext(token.ownerId, token.organizationId, token.restaurantId);
  if (!context || context.membership_id !== session.membership_id) throw authRequired();
  return { ...context, session_id: token.jti };
}

export function logout(user) {
  authRepository.revokeAuthSession(user.session_id);
  return { ok: true };
}

export function checkEmailAvailability(body) {
  const { email } = validate(emailAvailabilitySchema, body);
  return { available: !authRepository.isEmailRegistered(email) };
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
  const context = authRepository.getAuthContext(owner.id, parsed.data.organizationId, parsed.data.restaurantId);
  if (!context) throw forbidden("No access to that organization or restaurant");
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
