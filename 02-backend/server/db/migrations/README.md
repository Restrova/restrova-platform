# Migrations

Future production migrations should live here and follow ordered filenames:

```text
0001_initial_schema.sql
0002_add_branch_scope.sql
```

Requirements before real production use:

- migrations table with applied version tracking
- transactional migration execution where supported
- staging migration dry run
- rollback or forward-fix plan
- migration tests in `../tests/`
