# Task 1.3 QA coverage

Task 1.3 verifies that onboarding creates a complete scoped account and that authenticated data never crosses organization, restaurant, branch, or role boundaries.

## Automated coverage

| Layer                  | Scenario                                                                               | Expected result                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Full stack             | Complete the five-step onboarding UI against the real Express API                      | Owner, organization, restaurant, and first branch are persisted; the authenticated branch screen opens |
| Authentication         | Restore the new token and log in with explicit organization/restaurant context         | The same organization, restaurant, role, defaults, and branch are returned                             |
| Organization isolation | Read organization, restaurant, members, branches, and session with two tenants present | Only the authenticated tenant is visible                                                               |
| Organization isolation | Edit or assign a branch belonging to another tenant                                    | The API returns `404` and creates no membership                                                        |
| Branch isolation       | Log in as a branch manager with multiple branches and distinct sales evidence          | Session, branch list, and dashboard include only the assigned branch                                   |
| Role boundary          | Branch manager attempts owner-only member, branch, or import mutations                 | The API returns `403`                                                                                  |
| Localization           | Exercise onboarding and navigation dictionaries                                        | Arabic RTL, English, and Simplified Chinese keys remain resolved by frontend tests                     |

The full-stack test uses a unique temporary SQLite database and an ephemeral HTTP port. It does not use demo fixtures, external services, production credentials, or invented assertions: every expected identifier and value comes from data created during that test.

## Release gate

Run `pnpm validate`. The task may merge only after local validation and the GitHub Actions monorepo quality gate both pass.
