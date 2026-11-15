# Restrova visual identity

Restrova's current identity uses obsidian backgrounds, orange accents, warm
restaurant photography, and a restaurant-cloche R mark. It follows the supplied
black-and-orange restaurant intelligence reference. The previous green mascot
identity is superseded.

| Token              | Color     | Role                                              |
| ------------------ | --------- | ------------------------------------------------- |
| `--brand-obsidian` | `#0B0D12` | Page background                                   |
| `--brand-orange`   | `#FF6A00` | Primary actions, active navigation, brand accents |
| `--brand-crimson`  | `#E11D48` | Decorative accent                                 |
| `--brand-amber`    | `#F59E0B` | Decorative highlight                              |
| `--brand-cream`    | `#FFF7ED` | Primary text                                      |
| `--brand-slate`    | `#334155` | Supporting neutral                                |

Sora supplies Latin headings, Inter supplies interface text, and IBM Plex Sans
Arabic supplies Arabic text with Noto Sans Arabic as a fallback. Font files and
SIL Open Font License notices are self-hosted. Arabic retains natural letter
spacing and right-to-left flow.

Use dark layered cards and subtle borders. Orange is reserved for primary
controls, selected navigation, and focused visual emphasis. Primary orange
buttons use dark text for readability. Keep success, warning, error, and
information colors distinct from branding; green financial gains remain green.
Data fields and money values retain the readable interface typeface.

`BrandMark` and `public/brand-mark.svg` supply the cloche R mark. The generated
restaurant photograph is `public/images/restrova/restaurant-hero.png`. Legacy
mascot assets remain in the repository for history but are no longer used by
the current login, executive welcome, assistant, or public preview.

The app shares semantic design tokens in `styles/tokens.css`. Existing brand
aliases remain for compatibility; the current theme is completed in
`styles/obsidian-identity.css`. Authentication and restaurant data behavior are
unchanged by the identity update.

The separate public preview contains a landing page and switchable HTML design
studies for the dashboard, English and Arabic sign-in, and mobile. Its business
figures are illustrative. It has no account access, API, or persistent data.
