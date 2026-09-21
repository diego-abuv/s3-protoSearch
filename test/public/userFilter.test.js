import { describe, it, expect } from 'vitest';

await import('../../public/js/userFilter.js');

const { items, matches } = globalThis.AuditUserFilter;

describe('AuditUserFilter.items', () => {
  it('retorna um botao por usuario com data-value correto', () => {
    const html = items(['alice', 'bob']);
    expect(html).toContain('class="audit-user-combo-item"');
    expect(html).toContain('data-value="alice"');
    expect(html).toContain('data-value="bob"');
    expect(html.split('</button>').length - 1).toBe(2);
  });

  it('escapa caracteres especiais do username', () => {
    const html = items(['o"rito <&>']);
    expect(html).toContain('data-value="o&quot;rito &lt;&amp;&gt;"');
    expect(html).not.toContain('<&>');
  });

  it('retorna string vazia para lista vazia ou undefined', () => {
    expect(items([])).toBe('');
    expect(items(undefined)).toBe('');
  });
});

describe('AuditUserFilter.matches', () => {
  it('filtra por substring case-insensitive', () => {
    expect(matches(['Alice', 'Bob', 'Carla'], 'ali')).toEqual(['Alice']);
    expect(matches(['Alice', 'Bob', 'Carla'], 'b')).toEqual(['Bob']);
  });

  it('retorna a lista completa com query vazia', () => {
    expect(matches(['Alice', 'Bob'], '')).toEqual(['Alice', 'Bob']);
    expect(matches(['Alice', 'Bob'], '   ')).toEqual(['Alice', 'Bob']);
  });

  it('retorna lista vazia quando nao encontra', () => {
    expect(matches(['Alice'], 'zzz')).toEqual([]);
  });

  it('suporta undefined em usernames e query', () => {
    expect(matches(undefined)).toEqual([]);
    expect(matches(['Alice'], undefined)).toEqual(['Alice']);
  });
});