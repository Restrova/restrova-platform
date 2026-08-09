# Schema

The current executable schema is still defined in `../../src/db.js`.

Production target:

- Move table definitions into versioned migration files.
- Keep this folder as the human-readable schema reference.
- Update this reference whenever migrations change the database shape.
