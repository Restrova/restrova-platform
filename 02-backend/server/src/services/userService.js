import bcrypt from "bcryptjs";
import { config } from "../config/appConfig.js";
import { notFound, validationError } from "../errors/appError.js";
import * as userRepository from "../repositories/userRepository.js";
import { assertBranchAccess } from "./branchService.js";
import { generateTemporaryPassword } from "./authService.js";
import { inviteUserSchema, updateUserRoleSchema, validate } from "../validation/schemas.js";

export function inviteUser(user, body) {
  const parsed = validate(inviteUserSchema, body);
  if (parsed.role === "branch_manager" && !parsed.branchId) throw validationError("Branch manager requires a branch.");
  if (parsed.branchId && !assertBranchAccess(user, parsed.branchId)) throw notFound("Branch not found");

  let invited = userRepository.findOwnerIdentityByEmail(parsed.email);
  const temporaryPassword = generateTemporaryPassword();
  if (!invited) {
    invited = userRepository.createOwnerIdentity(
      parsed.email,
      bcrypt.hashSync(temporaryPassword, config.bcryptCost),
      parsed.name || parsed.email.split("@")[0]
    );
  }
  userRepository.upsertOrganizationUser(user.organization_id, invited.id, parsed.role, parsed.branchId || null);
  return {
    id: invited.id,
    email: invited.email,
    name: invited.name,
    role: parsed.role,
    branch_id: parsed.branchId || null,
    temporaryPassword
  };
}

export function listUsers(user) {
  return userRepository.listUsers(user.organization_id);
}

export function updateUserRole(user, ownerId, body) {
  const parsed = validate(updateUserRoleSchema, body);
  if (parsed.role === "branch_manager" && !parsed.branchId) throw validationError("Branch manager requires a branch.");
  if (parsed.branchId && !assertBranchAccess(user, parsed.branchId)) throw notFound("Branch not found");
  const membership = userRepository.findMembership(user.organization_id, ownerId);
  if (!membership) throw notFound("User not found");
  userRepository.updateMembershipRole(membership.id, parsed.role, parsed.branchId);
  return { updated: true };
}
