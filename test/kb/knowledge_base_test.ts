import { parsePage } from '../../scripts/kb/frontmatter.js';
import { render } from '../../scripts/kb/markup.js';
import { check, readInstallation, readPages, targetsOf } from '../../scripts/kb/pages.js';

describe('the knowledge base', () => {
  const pages = readPages();
  const installed = readInstallation();

  it('has the installation record to check its pages against', () => {
    expect(installed.length).toBeGreaterThan(0);
  });

  it('claims nothing the installation and the repository do not support', () => {
    expect(check(pages, installed)).toEqual([]);
  });

  it('has no reference that does not resolve', () => {
    const targets = targetsOf(pages, installed);
    const errors: string[] = [];

    for (const page of pages) {
      render(page.body, { up: '', targets, file: page.file, errors });
    }

    expect(errors).toEqual([]);
  });
});

describe('front matter', () => {
  it('refuses a field the schema does not name', () => {
    expect(() => parsePage('x.md', '---\nkind: topic\nname: X\ncolour: red\n---\n')).toThrow(
      /no field "colour"/
    );
  });

  it('asks a file page how far it is understood', () => {
    expect(() => parsePage('x.md', '---\nkind: file\nname: X\nfiles: [A]\n---\n')).toThrow(
      /status/
    );
  });

  it('reads a list wrapped one item a line, as Prettier writes it', () => {
    const { front } = parsePage(
      'x.md',
      '---\nkind: format\nname: X\nstatus: partial\nfiles:\n  [\n    A/B,\n    C/D,\n  ]\n---\nbody'
    );

    expect(front.files).toEqual(['A/B', 'C/D']);
  });
});

describe('references', () => {
  const targets = {
    files: new Map([
      ['DOGZ.DOG/THINK.DLL', { url: 'files/think-dll/index.html', title: 'THINK.DLL' }],
    ]),
    topics: new Map(),
    formats: new Map(),
    guides: new Map(),
  };

  it('link a file by its path, in any case', () => {
    const errors: string[] = [];
    const { html } = render('See [[file:dogz.dog/think.dll]].', {
      up: '../../',
      targets,
      file: 'x.md',
      errors,
    });

    expect(errors).toEqual([]);
    expect(html).toContain('<a href="../../files/think-dll/index.html"><code>THINK.DLL</code></a>');
  });

  it('fail on a file that is not installed', () => {
    const errors: string[] = [];
    render('[[file:DOGZ.DOG/NOPE.DLL]]', { up: '', targets, file: 'x.md', errors });

    expect(errors).toEqual(['x.md: no file DOGZ.DOG/NOPE.DLL']);
  });

  it('draw evidence labels', () => {
    const errors: string[] = [];
    const { html } = render('[[read out]] It does.', { up: '', targets, file: 'x.md', errors });

    expect(html).toContain('<span class="label read-out">Read out</span>');
  });
});
