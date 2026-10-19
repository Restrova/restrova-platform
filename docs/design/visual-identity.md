# Restrova visual identity

Restrova uses deep forest-green typography, fresh green accents, mint, sage,
and warm cream paper with a precise graph-paper grid. The supplied visual
references informed the outlined labels, small square accents, and tactile
mascot direction. The green palette follows the requested Restrova identity.
Restrova uses its own mark, artwork, and product language.

## Palette

| Token                 | Color     | Use                                                 |
| --------------------- | --------- | --------------------------------------------------- |
| `--brand-forest`      | `#173E2F` | Headings, primary controls, brand text              |
| `--brand-forest-deep` | `#102D23` | Navigation and dark backgrounds                     |
| `--brand-green`       | `#8EDB70` | Selected navigation, square accents, offset details |
| `--brand-leaf`        | `#287A45` | Supporting headings, chart bars, outlines and focus |
| `--brand-mint`        | `#EAF4E5` | Quiet highlights and secondary surfaces             |
| `--brand-sage`        | `#B8C8A0` | Supporting decorative details                       |
| `--brand-coral`       | `#E49B7C` | Tiny optional warm details                          |
| `--brand-paper`       | `#FAFBF4` | Page and brand surfaces                             |

Use forest text on fresh green and white text on forest primary buttons. Use
leaf green, rather than the bright accent, for small green text on white. Coral
is limited to small decorative details and never serves as a primary color.
Success, warning, danger, and informational states keep their semantic tokens so
financial results, validation, and operational alerts retain their meanings.

## Typography and composition

Use the local condensed display face through `--font-family-display` for Latin
brand headlines and the wordmark. Keep Noto Sans Arabic for Arabic and readable
interface text. Body copy, tables, monetary values, forms, and chart labels use
`--font-family-sans`. Arabic keeps natural letter spacing and right-to-left flow.

Use a faint grid on open paper surfaces, solid backgrounds behind data, thin
outlines, modest corner radii, and small offset shadows. Square forest, green,
and sage accents belong near labels and artwork. Keep decoration away from
financial values and table cells. Avoid large gradients and heavy glass effects.

## Reusable elements

- `BrandMark` supplies the Restrova mark, including a current-color navigation variant.
- `BrandPixels` supplies the three decorative squares and is hidden from assistive technology.
- `.brand-overline` is an outlined product label.
- `.welcome-card__art` contains decorative Rivo artwork on an outlined paper frame.
- `.simple-kpi`, `.simple-panel`, and `.ui-card` share the paper-and-ink surface treatment.

Rivo is a friendly green restaurant companion with small warm accents. Use the
mascot at welcome, onboarding, and assistant moments; keep dense operations
views focused on the restaurant's information. Decorative mascot images have
empty alternative text when adjacent copy already communicates their purpose.

The product family is Restrova Business, Restrova Market, and Restrova Discover.
Brand labels do not imply that an unimplemented product or capability is available.

## Accessibility and responsive behavior

Keep visible keyboard outlines on both dark and light surfaces. Pair state
colors with existing text and icons. Respect reduced-motion preferences, retain
logical layout properties for RTL, and let headings and controls wrap on small
screens. Mobile navigation uses the same forest, green, and square vocabulary.

## Source files

The shared palette and roles live in
`03-frontend/web/src/styles/tokens.css`. The operational shell, components, and
pages are styled by `03-frontend/web/src/styles/brand-identity.css`. Authentication
uses `03-frontend/web/src/styles/premium-login.css` and the localized `BrandStory`
component. Public product-family labels mark Market and Discover as coming soon.

## Brand assets

- `03-frontend/web/public/brand-mark.svg`: scalable Restrova R-plate mark and favicon.
- `03-frontend/web/public/images/restrova/rivo-plush.webp`: original green Rivo redesign, optimized with transparency.
- `03-frontend/web/public/images/restrova/brand-hero.webp`: original restaurant collage with Jeddah-inspired architecture and Rivo.
- `03-frontend/web/public/fonts/barlow-condensed-800.ttf`: locally hosted Barlow Condensed ExtraBold, with its license in `BarlowCondensed-OFL.txt`.

The new imagery was generated for Restrova using the existing Rivo character and
the supplied palette/material references. The old artwork remains available in
the repository. No third-party brand names or reference slogans appear in the app.
Arabic uses the existing locally hosted Noto Sans Arabic family. The public hero
uses a static image and does not fetch or autoplay the old login video.

## Motion

`03-frontend/web/src/styles/brand-motion.css` is imported last so the accessibility
rules cover the complete interface. Public headings, form sections, product-family
cards, and welcome copy enter once with a short, staggered fade and 10px rise.
Rivo's public hero and welcome artwork float gently once for 4.2 seconds after a
600ms delay, then rest. Automatic decorative motion ends within five seconds
without needing a pause control. Small screens at 760px and below keep the artwork
still.

Pointer hover and keyboard focus provide a restrained lift on action buttons;
product-family cards have a 2px hover lift without changing their informational
role. Keyboard outlines remain visible. Animations and motion transitions use
only opacity and transforms, do not change layout, and require no JavaScript or
additional dependencies. Financial values, chart data, tables, and operational
rows remain still.

The `prefers-reduced-motion: reduce` preference disables all interface animations,
transitions, and smooth scrolling, including existing loading animations. Loading
states retain their text and accessibility semantics. Reduced motion never hides
content or prevents form submission.
