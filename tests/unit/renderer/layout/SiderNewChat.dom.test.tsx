import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sider from '@/renderer/components/layout/Sider';

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  navigate: vi.fn(),
  reload: vi.fn(),
  error: vi.fn(),
  closePreview: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: { remoteEnvironment: { disconnect: { invoke: mocks.disconnect } } },
}));

vi.mock('@arco-design/web-react', async (original) => ({
  ...(await original<typeof import('@arco-design/web-react')>()),
  Message: { error: mocks.error },
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/conversation/test', search: '', hash: '' }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', logout: vi.fn() }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: mocks.closePreview, clearPreviewForScope: vi.fn() }),
}));
vi.mock('@/renderer/components/layout/Sider/SiderNav', () => ({
  SiderToolbar: ({ onNewChat }: { onNewChat: () => void }) => <button onClick={onNewChat}>new-chat</button>,
  SiderSearchEntry: () => null,
  SiderScheduledEntry: () => null,
  SiderAssistantEntry: () => null,
}));
vi.mock('@/renderer/components/layout/Sider/SiderFooter', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/Sider/TeamSiderSection', () => ({ default: () => null }));
vi.mock('@renderer/pages/conversation/GroupedHistory', () => ({ default: () => null }));
vi.mock('@renderer/pages/settings/components/SettingsSider', () => ({ default: () => null }));

describe('Sider new chat environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__backendEnvironment = { type: 'local' };
    mocks.disconnect.mockResolvedValue({ ok: true, data: { type: 'local' } });
    vi.stubGlobal('location', { ...window.location, reload: mocks.reload });
  });

  afterEach(() => {
    cleanup();
    delete window.__backendEnvironment;
    vi.unstubAllGlobals();
  });

  it('disconnects before navigating and reloading for a local new chat', async () => {
    window.__backendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' };
    render(<Sider />);
    fireEvent.click(screen.getByText('new-chat'));

    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { state: { resetAssistant: true } });
    expect(mocks.reload).toHaveBeenCalledOnce();
    expect(mocks.closePreview).toHaveBeenCalledOnce();
  });

  it('keeps the local navigation path without disconnecting again', async () => {
    render(<Sider />);
    fireEvent.click(screen.getByText('new-chat'));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/guid', { state: { resetAssistant: true } }));
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('keeps the current route when returning to local fails', async () => {
    window.__backendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' };
    mocks.disconnect.mockResolvedValue({ ok: false, code: 'failed', message: 'Disconnect failed' });
    render(<Sider />);
    fireEvent.click(screen.getByText('new-chat'));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Disconnect failed'));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
