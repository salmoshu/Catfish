/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessageFileChanges from '@/renderer/pages/conversation/Messages/MessageFileChanges';
import { parseFileChange } from '@/renderer/utils/file/diffUtils';

const { launchPreview, openWorkbenchSection } = vi.hoisted(() => ({
  launchPreview: vi.fn(),
  openWorkbenchSection: vi.fn(),
}));

vi.mock('@/renderer/hooks/file/usePreviewLauncher', () => ({
  usePreviewLauncher: () => ({ launchPreview }),
}));

vi.mock('@/renderer/pages/conversation/Workbench/workbenchActivityStore', () => ({ openWorkbenchSection }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const file = parseFileChange('/workspace/app.ts', 'const oldValue = true;', 'const newValue = false;');

describe('MessageFileChanges completed-turn summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the selected file in the sidebar while keeping Changes selected', () => {
    render(<MessageFileChanges diffsChanges={[file]} variant='summary' />);

    fireEvent.click(screen.getByRole('button', { name: '/workspace/app.ts' }));

    expect(openWorkbenchSection).toHaveBeenCalledWith('changes');
    expect(launchPreview).toHaveBeenCalledWith(
      expect.objectContaining({ placement: 'sidebar', relativePath: '/workspace/app.ts', file_name: 'app.ts' })
    );
  });

  it('opens the selected diff in the sidebar from the change counts', () => {
    render(<MessageFileChanges diffsChanges={[file]} variant='summary' />);

    fireEvent.click(screen.getByRole('button', { name: 'messages.fileChanges: /workspace/app.ts' }));

    expect(openWorkbenchSection).toHaveBeenCalledWith('changes');
    expect(launchPreview).toHaveBeenCalledWith(
      expect.objectContaining({ placement: 'sidebar', contentType: 'diff', diffContent: file.diff })
    );
  });

  it('renders no summary or actions when the turn has no file changes', () => {
    const { container } = render(<MessageFileChanges diffsChanges={[]} variant='summary' />);

    expect(container).toBeEmptyDOMElement();
  });
});
