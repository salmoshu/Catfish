import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentLogoIcon } from '@/renderer/components/agent/AgentBadge';
import openaiLogo from '@renderer/assets/logos/openai.svg';

vi.mock('@/renderer/utils/model/agentLogo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/utils/model/agentLogo')>();
  return { ...actual, useAgentLogos: () => ({}) };
});
vi.mock('@/renderer/components/agent/ThemedLogo', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe('Codex header identity', () => {
  it.each([{ agentLogo: 'legacy.svg' }, { agentLogo: '🐟', agentLogoIsEmoji: true }, { agentLogoIsFallback: true }])(
    'uses OpenAI instead of a stale assistant logo: %s',
    (props) => {
      render(<AgentLogoIcon backend='codex' {...props} />);
      expect(screen.getByRole('img')).toHaveAttribute('src', openaiLogo);
    }
  );

  it('retains the configured icon for other agents', () => {
    render(<AgentLogoIcon backend='claude' agentLogo='custom.svg' />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'custom.svg');
  });

  it('renders a fallback for an unknown backend without a logo', () => {
    render(<AgentLogoIcon backend='unknown' />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
