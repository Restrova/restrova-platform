# Restrova visual identity

The current identity uses deep indigo, mint, white space and restaurant still-life imagery.
The supplied Arabic editorial reference informs the contrast, typography, realistic objects
and restrained depth. Restrova keeps its own mark, copy and artwork. The earlier cartoon
mascot and yellow accent are no longer used in the interface.

## Palette and typography

| Role         | Value     | Use                                                 |
| ------------ | --------- | --------------------------------------------------- |
| Deep ink     | `#101943` | Navigation, dark text                               |
| Indigo       | `#202a68` | Brand text, primary controls                        |
| Royal indigo | `#303fac` | Supporting highlights and focus                     |
| Mint         | `#59e0c1` | Dark-surface accents, selected navigation, hero CTA |
| Paper        | `#f8f9ff` | Quiet workspace background                          |
| White        | `#ffffff` | Data and form surfaces                              |

Existing `--brand-forest` and `--brand-green` variable names are retained for compatibility;
their values now represent indigo and mint. Never use mint for small text on white.
Success, warning and error tokens retain their semantic meanings.

Use locally hosted Noto Sans Arabic for readable Arabic headings and body text. Preserve
natural Arabic spacing, RTL flow and logical layout properties. English uses the shared
sans-serif stack. Marketing headlines use strong hierarchy; financial tables and forms
remain compact and quiet.

## Artwork and composition

`03-frontend/web/public/images/restrova/restaurant-still-life.webp` is the current generated,
transparent hero: a plated meal, silver service cloche, flowing receipt and mint glass bars.
It connects hospitality to financial clarity. The original PNG is retained in the execution
workspace; the optimized WebP is the deployable asset. Reference screenshots are not copied
into application artwork. No third-party brand marks or slogans appear in the app.

Use this scene on the homepage, login and welcome panel. Small assistant/insight positions
use the Restrova mark instead of a miniature character. Decorative images have empty alt text
where adjacent text communicates their purpose. Old green assets remain in the repository
for compatibility but are not selected by these screens.

The homepage links to the existing Business login. Market and Discover are explicitly marked
as in development. Branding does not establish that either product is implemented.

## Motion and accessibility

Headings enter gently once, and desktop artwork floats once before resting. Small screens
keep artwork still. The motion button pauses animation and preserves its state during
client-side navigation. The operating system's reduced-motion preference takes priority.
Keep visible focus outlines, normal keyboard controls and text labels alongside status colors.

## Source and preview

- `src/styles/tokens.css`: shared palette and typography.
- `src/styles/brand-identity.css`: operational shell and components.
- `src/styles/premium-login.css`: authentication layout.
- `src/styles/world-identity.css`: final shared identity and homepage styles.
- `src/styles/brand-motion.css`: shared motion and reduced-motion support.
- `src/components/brand/BrandStory.jsx`: localized login scene.
- `src/pages/LandingPage.jsx`: product-family homepage.

Source paths above are relative to `03-frontend/web/`. The visual gallery is in
`03-frontend/visual-preview/`, with captured application screens in `docs/design/previews/`.
See [preview screenshots](green-preview.md) and [free hosting instructions](free-preview-deployment.md).
The gallery contains images, not working login forms or live restaurant data.
