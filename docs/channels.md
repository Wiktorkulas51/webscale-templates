# Distribution channels

Each entry in `templates/<slug>/template.json` lists the channel keys where the template is published. This table maps every key to the asset file to upload and the size the channel expects.

Requirements come from the WebScale channel playbooks. Items marked "unconfirmed" were not verified against the channel's own help pages.

| Channel key | Channel | Asset file | Required size | Notes |
| --- | --- | --- | --- | --- |
| `github` | GitHub, public template repository | `social-preview-1280x640.png` (Social preview) | 1280 x 640, PNG, max 1 MB | Set the repository as a Template repository. Topics: up to 20, lowercase, up to 50 characters each. The README uses `cover-1280x720.webp`. Free templates only. |
| `gumroad` | Gumroad product page | `cover-1280x720.webp` (cover), `fullpage-desktop.webp` and `mobile-390.webp` (gallery) | Cover 1280 x 720 | Cover size is from the playbook and unconfirmed in Gumroad's help. Thumbnail 600 x 600 is not generated yet. Used for paid and free ($0+) products. |
| `astro` | Astro Themes catalog (`portal.astro.build/themes/submit`) | `cover-1280x720.webp` (first screenshot), then further screenshots | 1280 x 720 | Screenshot dimensions and count are unconfirmed. Paid themes link to the Gumroad product. |
| `dribbble` | Dribbble shot | `dribbble-1600x1200.png` (cover block) | 1600 x 1200, PNG, max 10 MB | Minimum width 1600 px. The 4:3 size is the package standard, not a Dribbble requirement. |
| `behance` | Behance project | `behance-1616x1264.png` (cover) | 1616 x 1264 (2x of 808 x 632) | Cover minimum is 808 x 632. Modules: `fullpage-desktop.webp` (1440 px wide) and `mobile-390.webp`. Behance pages return 403 to scripts, so these limits come from search snippets and are unconfirmed. |
| `webscale-site` | webscale.pl template page | `og-1200x630.webp` (Open Graph image) | 1200 x 630, WebP | The site keeps its own 1280 x 720 preview images in its repository, so the cover here is not uploaded there. |

## Asset list (per template)

| File | Size | Used by |
| --- | --- | --- |
| `cover-1280x720.webp` | 1280 x 720 | Gumroad, Astro Themes, README |
| `social-preview-1280x640.png` | 1280 x 640, max 1 MB | GitHub |
| `og-1200x630.webp` | 1200 x 630 | webscale-site |
| `dribbble-1600x1200.png` | 1600 x 1200 | Dribbble |
| `behance-1616x1264.png` | 1616 x 1264 | Behance |
| `fullpage-desktop.webp` | 1440 px wide, full page | Gumroad gallery, Behance module |
| `mobile-390.webp` | 390 x 844 | Gumroad gallery, Behance module |

All images are captured from the template's `links.liveDemo` by `npm run assets`. The crops show the top of the page (the hero), except the full-page capture.
