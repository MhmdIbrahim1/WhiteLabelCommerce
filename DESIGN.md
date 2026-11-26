# WhiteLabelCommerce design constitution

These rules govern new interfaces and changes to existing ones. Apply platform appearance tokens inside the platform surface. Each merchant owns the visual identity of their storefront.

## Color, shape and hierarchy

Use the light-first Commerce Crisp palette in a 60–30–10 composition. Give roughly 60% of a page to the reading surface, 30% to grouped content and 10% to actions and emphasis.

| Role | Default | Treatment |
| --- | --- | --- |
| Reading surface | `#FFFFFF` | Generous uninterrupted space around the principal task |
| Grouped content | `#F4F4F5` | 24px feature cards at the balanced radius scale |
| Primary action and category badge | `#0B0B0C` | Solid fill, a legible label, a compact radius on badges |
| Primary text | `#111315` | One dominant headline, readable body weight |
| Dividers | `#DADBDD` | A single 1px hairline |

Executive Dark and Warm Editorial assign new values to the same semantic roles. Reserve saturated color for merchandise, merchant identity and meaningful states. Exclude generic purple or indigo gradients, glass panels and thick borders with stacked shadows. Use a shadow sparingly for an object that actually floats.

Resolve every accent-filled control with the shared WCAG utility. Choose white or matte-black lettering by relative luminance. Where both choices fall below 4.5:1, shift the control fill just enough to pass and retain the selected accent elsewhere. Use a visible keyboard focus ring on both light and dark surfaces. [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## Arabic and Latin

Set Arabic UI and headings in locally served IBM Plex Sans Arabic by default. Pair it with DM Sans for geometric Latin forms. The selectable Alexandria and Readex Pro pairs carry both scripts. Use the document’s language and direction for the first server render. Give mixed-language fields their own language and direction.

Keep Arabic letter spacing at zero, including in buttons, badges and mixed-script layouts. Set Arabic body leading to 1.75–1.85 and heading leading to 1.3–1.4. Let both scripts wrap at narrow widths and increased zoom. Choose words and line breaks independently in each language.

Use tabular numerals for prices, quantities, dates and usage counters. Wrap numbers, currency strings, domains and codes in `<bdi dir="ltr">` with `unicode-bidi: isolate`. Keep units and translated labels outside the isolate when they belong to the sentence.

## Layout and interaction

Use logical spacing, borders and positioning, including `padding-inline`, `margin-block`, `inset-inline-start` and `text-align: start`. Follow the reading direction for keyboard navigation and content order. Use the same 1.5px Lucide stroke throughout an interface. Mirror navigation arrows in RTL. Keep locks, brand marks, charts and device hardware in their natural orientation.

Ground features in real product anatomy. A domain control should show an address and verification state. A storefront preview should show a product and its buying attributes. Put descriptive text next to the control it explains. Omit decorative counters, empty badges, surplus headings and invented business metrics. Identify illustrative data.

Use transform and opacity for movement. Honor the platform motion switch and the visitor’s reduced-motion preference independently. Every control must work with the keyboard and touch. Keep validation, active states and live feedback legible without color or animation. Keep a floating action clear of inputs, navigation and the last footer link.
