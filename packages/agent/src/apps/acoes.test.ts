import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync(new URL('./acoes.ps1', import.meta.url), 'utf8');

describe('acoes.ps1', () => {
  it('não usa Split-Path com -LiteralPath e -Parent, que o PowerShell 5.1 recusa', () => {
    expect(script).not.toMatch(/Split-Path[^\n]*-LiteralPath[^\n]*-Parent/);
    expect(script).not.toMatch(/Split-Path[^\n]*-Parent[^\n]*-LiteralPath/);
  });

  it('abre o programa a partir da pasta dele', () => {
    expect(script).toContain('-WorkingDirectory ([System.IO.Path]::GetDirectoryName($Caminho))');
  });
});
