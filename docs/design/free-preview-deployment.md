# Free Restrova visual preview

This is a separate static website showing the green artwork and verified
English, Arabic, mobile and Business workspace screenshots. It has no login,
database, API, analytics or saved data. The workspace screenshot uses a synthetic
review tenant. Market and Discover remain marked as coming soon.

## Deploy on Render

In the Render dashboard, select **New → Static Site**, connect
`Restrova/restrova-platform`, and use these settings:

| Setting           | Value                                   |
| ----------------- | --------------------------------------- |
| Name              | `restrova-visual-preview`               |
| Branch            | `feat/restrova-static-preview`          |
| Root directory    | Leave empty                             |
| Build command     | `node scripts/build-visual-preview.mjs` |
| Publish directory | `dist/visual-preview`                   |
| Auto-deploy       | After CI checks pass                    |
| Environment       | None required                           |

Create a **Static Site**, not a Node Web Service. There is no start command,
disk, database or paid compute instance for this preview. Keep the existing
`ai-restaurant-manager` service unchanged. Render's static hosting free-tier
usage limits still apply; do not enable paid upgrades for this preview.

The optional `render.preview.yaml` describes only the static preview, including
security headers. If using a Blueprint, explicitly select this file. The root
`render.yaml` describes the full application and its paid persistent storage.
For a manually created Static Site, copy the headers from `render.preview.yaml`
into the site's Headers settings.

After deployment, open the public URL shown by Render and check all four
screenshot buttons, image downloads, mobile layout and reduced-motion behavior.
The screenshots are static: buttons shown inside an image are not interactive.
A successful Git push or local build does not establish a successful deployment.

## Build locally

From the repository root, with Node.js 22:

```sh
node scripts/build-visual-preview.mjs
```

This command needs no package installation or credentials. It writes only to
the ignored `dist/visual-preview` directory and copies an explicit list of
public design assets. No application source, customer records, environment
files or database files are published. Publish this output directory only.

The original application, authentication, production storage checks and security
workflows are unchanged. This preview does not unblock the full application's
production deployment or customer launch.
