import * as authService from "./authService.js";
import * as authRepository from "../repositories/authRepository.js";
import * as organizationRepository from "../repositories/organizationRepository.js";
import { organizationSchema, restaurantSchema, switchRestaurantSchema, validate } from "../validation/schemas.js";

export function createOrganization(user, body) {
  return organizationRepository.createOrganizationForOwner(user, validate(organizationSchema, body));
}

export function currentOrganization(user) {
  return {
    id: user.organization_id,
    name: user.organization_name,
    currency: user.currency,
    timezone: user.timezone,
    language: user.language
  };
}

export function listRestaurants(user) {
  return organizationRepository.listRestaurantsForOrganization(user);
}

export function createRestaurant(user, body) {
  const created = organizationRepository.createRestaurantForOrganization(user, validate(restaurantSchema, body));
  // H7: reissue the token so the session immediately points at the newly
  // created restaurant instead of requiring a fresh login. The restaurant
  // fields stay at the top level for backward compatibility.
  const context = authRepository.getAuthContext(user.owner_id, user.organization_id, created.id);
  return {
    ...created,
    token: authService.signContext(context),
    session: authService.serializeMe(context)
  };
}

export function currentRestaurant(user) {
  return {
    id: user.restaurant_id,
    name: user.restaurant_name,
    currency: user.currency,
    timezone: user.timezone,
    language: user.language
  };
}
