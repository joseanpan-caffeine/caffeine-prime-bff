import {
  ACTIONS_TAIL_MARKER,
  ASSISTANT_DISCLAIMER,
  buildSystemPrompt,
  parseAssistantOutput,
} from './system-prompt';

describe('system-prompt do Prime IA', () => {
  it('inclui regras de recusa, pt-BR e o contexto sem PII', () => {
    const prompt = buildSystemPrompt({
      boxItems: [{ handle: 'morning-shot', title: 'Morning Shot', quantity: 1 }],
      planName: 'Prime Anual',
      nextBillingAt: '2026-10-23T12:00:00Z',
    });
    expect(prompt).toMatch(/português do Brasil/);
    expect(prompt).toMatch(/Não dá diagnóstico/);
    expect(prompt).toMatch(/dose acima da indicada no rótulo/);
    expect(prompt).toMatch(/médico ou nutricionista/);
    expect(prompt).toContain('"planName":"Prime Anual"');
    expect(prompt).toContain('app://subscription/pause');
    expect(ASSISTANT_DISCLAIMER).toMatch(/não substituem orientação médica/);
  });

  it('separa a cauda JSON de ações e filtra deep links fora da allowlist', () => {
    const raw = `Você pode pausar pelo app.\n${ACTIONS_TAIL_MARKER}{"actions":[{"label":"Pausar","deepLink":"app://subscription/pause"},{"label":"X","deepLink":"https://evil.example"}]}`;
    expect(parseAssistantOutput(raw)).toEqual({
      content: 'Você pode pausar pelo app.',
      actions: [{ label: 'Pausar', deepLink: 'app://subscription/pause' }],
    });
  });

  it('cauda malformada → só o texto', () => {
    expect(parseAssistantOutput(`Oi\n${ACTIONS_TAIL_MARKER}{nope`)).toEqual({ content: 'Oi' });
    expect(parseAssistantOutput('Sem ações')).toEqual({ content: 'Sem ações' });
  });
});
