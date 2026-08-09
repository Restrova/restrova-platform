# Test Seeds

Test fixtures must be deterministic and safe for CI.

Guidelines:

- create data inside tests or dedicated seed helpers
- never depend on wall-clock dates without adding current-period fixtures
- avoid external services
- keep tenant/branch isolation cases explicit
