/**
 * The body of a knowledge base page: Markdown, with two additions the build
 * checks.
 *
 * References, written `[[kind:target]]` or `[[kind:target|text]]`, link to
 * another page of the site and fail the build if there is no such page:
 *
 *   [[file:DOGZ.DOG/THINK.DLL]]   an installed file, by its path on the drive
 *   [[topic:adoption-unlock]]     a topic page, by its file name in kb/topics/
 *   [[format:lnz]]                a file format page, by its file name in kb/formats/
 *   [[guide:reproducing]]         a guide, by its file name in kb/guides/
 *
 * A file reference resolves to the file's own page if it has one, and to its
 * row in the list of installed files if not -- so every installed file can be
 * named, and naming one that is not installed fails.
 *
 * Evidence labels, written `[[measured]]`, `[[read out]]`, `[[documented]]`,
 * `[[inferred]]` or `[[refused]]`, mark how a claim is known; see
 * `kb/README.md`.
 *
 * Raw HTML is not accepted: a page's body is text. A ```mermaid fence becomes
 * a diagram.
 */

import MarkdownIt from 'markdown-it';

export const LABELS: Record<string, string> = {
  documented: 'Documented',
  measured: 'Measured',
  'read out': 'Read out',
  inferred: 'Inferred',
  refused: 'Refused',
};

/** One thing a reference can point at: its URL from the site's root, and what to call it. */
export interface Target {
  url: string;
  title: string;
}

/** What references can point at. Files are keyed by their path, upper case. */
export interface Targets {
  files: Map<string, Target>;
  topics: Map<string, Target>;
  formats: Map<string, Target>;
  guides: Map<string, Target>;
}

export interface RenderContext {
  /** How to get from the page to the site's root: `../../`. */
  up: string;
  targets: Targets;

  /** The page's own file, for error messages. */
  file: string;

  /** Every reference that did not resolve is added here. */
  errors: string[];

  /** Told the site URL of every page a reference resolved to. */
  linked?: (url: string) => void;
}

export interface Rendered {
  html: string;
  mermaid: boolean;
}

export function render(body: string, context: RenderContext): Rendered {
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
  let mermaid = false;

  markdown.inline.ruler.before('link', 'kb_reference', (state, silent) => {
    const { src, pos } = state;

    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) {
      return false;
    }

    const end = src.indexOf(']]', pos + 2);

    if (end === -1) {
      return false;
    }

    if (!silent) {
      const token = state.push('kb_reference', '', 0);
      token.content = src.slice(pos + 2, end);
    }

    state.pos = end + 2;
    return true;
  });

  markdown.renderer.rules.kb_reference = (tokens, index) => {
    const inside = tokens[index].content;
    const escape = markdown.utils.escapeHtml;

    if (LABELS[inside]) {
      return `<span class="label ${inside.replace(' ', '-')}">${LABELS[inside]}</span>`;
    }

    const [reference, text] = inside.split('|');
    const [kind, ...rest] = reference.split(':');
    const target = rest.join(':');
    const { targets, up } = context;

    const link = (found: Target | undefined, code: boolean) => {
      if (!found) {
        context.errors.push(`${context.file}: no ${kind} ${target}`);
        return escape(text ?? target);
      }

      context.linked?.(found.url);

      const shown = escape(text ?? found.title);
      return `<a href="${up}${found.url}">${code && !text ? `<code>${shown}</code>` : shown}</a>`;
    };

    switch (kind) {
      case 'file':
        return link(targets.files.get(target.toUpperCase()), true);
      case 'topic':
        return link(targets.topics.get(target), false);
      case 'format':
        return link(targets.formats.get(target), false);
      case 'guide':
        return link(targets.guides.get(target), false);
      default:
        context.errors.push(`${context.file}: [[${inside}]] is not a reference or a label`);
        return escape(inside);
    }
  };

  const fence = markdown.renderer.rules.fence!;

  markdown.renderer.rules.fence = (tokens, index, options, env, self) => {
    if (tokens[index].info.trim() === 'mermaid') {
      mermaid = true;
      return `<pre class="mermaid">${markdown.utils.escapeHtml(tokens[index].content)}</pre>\n`;
    }

    return fence(tokens, index, options, env, self);
  };

  return { html: markdown.render(body), mermaid };
}
