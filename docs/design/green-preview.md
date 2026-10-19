# Restrova green design preview

These are screenshots of the running application using the green identity.
They show a local build, not a live Render deployment. The workspace uses a
synthetic review tenant and contains no customer data.

The interface uses forest green, fresh green, mint and cream. The hero artwork
and Rivo mascot follow the same palette. Headings and forms enter gently;
Rivo settles within five seconds. Mobile artwork stays still, and reduced-motion
preferences disable animations. Screenshots cannot demonstrate the motion.

Desktop and mobile browser checks verified English and Arabic layouts,
keyboard validation, loaded artwork, no horizontal overflow and no JavaScript
errors. `pnpm install --frozen-lockfile`, `pnpm security:audit`,
`pnpm security:test` and `pnpm validate` passed locally. Remote release checks
and Render deployment require separate verification.

## English login

![English login with forest green controls and green Rivo artwork](previews/login-en.png)

## Arabic login

![Arabic login with right-to-left layout and the green identity](previews/login-ar.png)

## Business workspace

![Business workspace with forest green navigation and green Rivo mascot](previews/workspace.png)

## Mobile login

![Green login layout on a mobile viewport](previews/login-mobile.png)
