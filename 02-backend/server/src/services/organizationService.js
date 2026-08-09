import * as organizationRepository from "../repositories/organizationRepository.js";
import { organizationSchema, restaurantSchema, validate } from "../validation/schemas.js";

export function createOrganization(user, body) {
  return organizationRepository.createOrganizationForOwner(user, validate(organizationSchema, body));
}

export function currentOrganization(user) {
  return { id: user.organization_id, name: user.organization_name, currency: user.currency, timezone: user.timezone, language: user.language };
}

export function createRestaurant(user, body) {
  return organizationRepository.createRestaurantForOrganization(user, validate(restaurantSchema, body));
}

export function currentRestaurant(user) {
  return { id: user.restaurant_id, name: user.restaurant_name, currency: user.currency, timezone: user.timezone, language: user.language };
}
