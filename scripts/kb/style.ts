/**
 * The knowledge base's stylesheet: winbox.js's, with this project's statuses.
 */

export const STYLE = `:root {
  --bg: #ffffff; --fg: #1b1b1f; --muted: #5b5b66; --line: #d9d9e0; --link: #1f5fbf;
  --implemented: #1d6b3a; --understood: #1f5fbf; --partial: #8a5a00; --unexplored: #6b6b75;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #16161a; --fg: #e8e8ee; --muted: #a2a2ae; --line: #33333b; --link: #7fb0ff;
    --implemented: #5fd08a; --understood: #7fb0ff; --partial: #e0b050; --unexplored: #a2a2ae; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, sans-serif; }
header.site, main, footer.site { max-width: 60rem; margin: 0 auto; padding: 0 16px; }
header.site { padding-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; align-items: baseline; }
header.site .home { font-weight: 600; color: var(--fg); text-decoration: none; }
nav { color: var(--muted); font-size: 0.9rem; }
nav.sections { display: flex; flex-wrap: wrap; gap: 0 1rem; }
header.site nav[aria-label="Breadcrumb"] { flex-basis: 100%; }
main pre code { font-size: 0.85rem; }
.search { --pf-text: var(--fg); --pf-text-secondary: var(--muted); --pf-text-muted: var(--muted); --pf-background: var(--bg); --pf-border: var(--line); --pf-border-focus: var(--link); --pf-outline-focus: var(--link); --pf-hover: var(--line); --pf-mark: var(--fg); --pf-font: inherit; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; }
.search-filters { display: flex; flex-wrap: wrap; gap: 0.5rem; }
a { color: var(--link); }
h1 { font-size: 1.8rem; margin: 1.5rem 0 0.5rem; overflow-wrap: anywhere; }
h2 { font-size: 1.2rem; margin: 2rem 0 0.5rem; }
.lead { font-size: 1.05rem; color: var(--muted); }
.note { color: var(--muted); font-size: 0.85rem; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.92em; }
table { width: 100%; border-collapse: collapse; margin: 1rem 0; display: block; overflow-x: auto; }
caption { text-align: left; color: var(--muted); font-size: 0.9rem; padding-bottom: 0.5rem; }
th, td { text-align: left; padding: 0.35rem 0.75rem 0.35rem 0; border-bottom: 1px solid var(--line); vertical-align: top; }
thead th { font-size: 0.85rem; color: var(--muted); font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1.5rem; }
dl.facts dt { color: var(--muted); }
dl.facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.badge { display: inline-block; font-size: 0.8rem; font-weight: 600; padding: 0 0.5rem; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
.badge.implemented { color: var(--implemented); } .badge.understood { color: var(--understood); }
.badge.partial { color: var(--partial); } .badge.unexplored { color: var(--unexplored); font-weight: 400; }
.label { display: inline-block; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 0 0.4rem; border-radius: 4px; background: var(--line); color: var(--fg); vertical-align: 0.1em; }
.label.measured { background: #d8ecdf; color: #134d29; } .label.read-out { background: #dce6f7; color: #173d7a; }
.label.documented { background: #ececf1; color: #3b3b44; } .label.inferred { background: #f6ead3; color: #6b4600; }
.label.refused { background: #f4dede; color: #7a1f1f; }
@media (prefers-color-scheme: dark) {
  .label.measured { background: #1f3a29; color: #9fe0b5; } .label.read-out { background: #1d2a44; color: #a9c4f5; }
  .label.documented { background: #2a2a32; color: #c9c9d3; } .label.inferred { background: #3b2f18; color: #ecc98a; }
  .label.refused { background: #3f1f1f; color: #f0aaaa; }
}
tr:target { background: var(--line); }
main pre { background: var(--line); padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; }
main pre.mermaid { background: none; padding: 0; }
main blockquote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid var(--line); color: var(--muted); }
ul.articles { padding-left: 1.2rem; } ul.articles li { margin: 0.3rem 0; }
footer.site { margin-top: 3rem; padding-bottom: 2rem; color: var(--muted); font-size: 0.85rem; border-top: 1px solid var(--line); }
`;
