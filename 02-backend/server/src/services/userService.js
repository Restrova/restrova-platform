import bcrypt from "bcryptjs";
import { config } from "../config/appConfig.js";
import { conflict, notFound, validationError } from "../errors/appError.js";
import { db } from "../db.js";
import * as userRepository from "../repositories/userRepository.js";
import { assertBranchAccess } from "./branchService.js";
import { generateTemporaryPassword } from "./authService.js";
import { inviteUserSchema, updateUserRoleSchema, validate } from "../validation/schemas.js";

export function inviteUser(user, body) {
  const parsed = validate(inviteUserSchema, body);
  if (parsed.role === "branch_manager" && !parsed.branchId) throw validationError("Branch manager requires a branch.");
  if (parsed.branchId && !assertBranchAccess(user, parsed.branchId)) throw notFound("Branch not found");

  return db
    .transaction(() => {
      let invited = userRepository.findOwnerIdentityByEmail(parsed.email);
      const existingAccount = Boolean(invited);
      // Invitations only add memberships. Role changes must use updateUserRole,
      // which protects the last owner and checks the target branch assignment.
      if (invited && userRepository.findMembership(user.organization_id, invited.id)) {
        throw conflict("User already belongs to this organization. Use the role update endpoint.");
      }
      let temporaryPassword = null;
      if (!invited) {
        temporaryPassword = generateTemporaryPassword();
        invited = userRepository.createOwnerIdentity(
          parsed.email,
          bcrypt.hashSync(temporaryPassword, config.bcryptCost),
          parsed.name || parsed.email.split("@")[0]
        );
      }
      userRepository.insertOrganizationUser(user.organization_id, invited.id, parsed.role, parsed.branchId || null);
      return {
        id: invited.id,
        email: invited.email,
        name: invited.name,
        role: parsed.role,
        branch_id: parsed.branchId || null,
        temporaryPassword,
        existingAccount
      };
    })
    .immediate();
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
  if (
    membership.role === "owner" &&
    parsed.role !== "owner" &&
    userRepository.countOrganizationOwners(user.organization_id) <= 1
  ) {
    throw validationError("Organization must keep at least one owner.");
  }
  userRepository.updateMembershipRole(membership.id, parsed.role, parsed.branchId);
  return { updated: true, role: parsed.role, branch_id: parsed.role === "branch_manager" ? parsed.branchId : null };
}
