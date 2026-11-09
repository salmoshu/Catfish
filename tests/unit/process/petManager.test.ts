import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Bounds = { x: number; y: number; width: number; height: number };
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  windows: [] as Array<{
    bounds: Bounds;
    setBounds: ReturnType<typeof vi.fn>;
    setPosition: ReturnType<typeof vi.fn>;
    destroyed: boolean;
  }>,
  cursor: { x: 1000, y: 500 },
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    commandLine: { getSwitchValue: vi.fn(() => '') },
  },
  BrowserWindow: class {
    static getAllWindows = () => [];
    bounds: Bounds;
    destroyed = false;
    constructor(options: Bounds) {
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      mocks.windows.push(this);
    }
    webContents = { send: vi.fn() };
    setAlwaysOnTop = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    on = vi.fn();
    loadFile = vi.fn().mockResolvedValue(undefined);
    isDestroyed = () => this.destroyed;
    isVisible = () => true;
    getPosition = () => [this.bounds.x, this.bounds.y];
    getSize = () => [this.bounds.width, this.bounds.height];
    hide = vi.fn();
    showInactive = vi.fn();
    setBounds = vi.fn((bounds: Bounds) => {
      this.bounds = { ...bounds };
    });
    // Reproduce native size rounding when moving a window on fractional DPI.
    setPosition = vi.fn((x: number, y: number) => {
      this.bounds = { x, y, width: this.bounds.width + 1, height: this.bounds.height + 1 };
    });
    destroy = () => {
      this.destroyed = true;
    };
  },
  ipcMain: {
    on: (channel: string, listener: () => void) => mocks.handlers.set(channel, listener),
    removeAllListeners: (channel: string) => mocks.handlers.delete(channel),
  },
  Menu: { buildFromTemplate: vi.fn() },
  screen: {
    getCursorScreenPoint: () => mocks.cursor,
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
}));
vi.mock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/common/adapter/main', () => ({ setPetNotifyHook: vi.fn() }));
vi.mock('@process/pet/petConfirmManager', () => ({
  initPetConfirmManager: vi.fn(),
  updateAnchorBounds: vi.fn(),
  destroyPetConfirmManager: vi.fn(),
  unhookPetConfirm: vi.fn(),
}));
vi.mock('@process/pet/petStateMachine', () => ({
  PetStateMachine: class {
    onStateChange = vi.fn();
    getCurrentState = () => 'idle';
    forceState = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('@process/pet/petIdleTicker', () => ({
  PetIdleTicker: class {
    onEyeMove = vi.fn();
    setPetBounds = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    resetIdle = vi.fn();
  },
}));
vi.mock('@process/pet/petEventBridge', () => ({
  PetEventBridge: class {
    dispose = vi.fn();
  },
}));

import { createPetWindow, destroyPetWindow, resizePetWindow } from '@process/pet/petManager';

beforeEach(() => {
  vi.useFakeTimers();
  mocks.windows.length = 0;
  mocks.cursor = { x: 1000, y: 500 };
  createPetWindow();
});
afterEach(() => {
  destroyPetWindow();
  vi.useRealTimers();
});

describe('desktop pet dragging', () => {
  it('keeps the rendered pet and hit region at their configured sizes through hundreds of moves', () => {
    mocks.handlers.get('pet:drag-start')?.();
    for (let index = 0; index < 300; index++) {
      mocks.cursor = { x: 1000 + index, y: 500 + index };
      vi.advanceTimersByTime(16);
    }
    expect(mocks.windows[0].bounds).toMatchObject({ width: 280, height: 280 });
    expect(mocks.windows[1].bounds).toMatchObject({ width: 168, height: 168 });
    expect(mocks.windows[1].bounds.x - mocks.windows[0].bounds.x).toBe(56);
  });

  it('uses the newly selected size when starting another drag', () => {
    resizePetWindow(200);
    mocks.handlers.get('pet:drag-start')?.();
    vi.advanceTimersByTime(1000);
    expect(mocks.windows[0].bounds).toMatchObject({ width: 200, height: 200 });
    expect(mocks.windows[1].bounds).toMatchObject({ width: 120, height: 120 });
  });

  it('stops following the pointer after drag end', () => {
    mocks.handlers.get('pet:drag-start')?.();
    vi.advanceTimersByTime(16);
    mocks.handlers.get('pet:drag-end')?.();
    const lastPosition = { ...mocks.windows[0].bounds };
    mocks.cursor = { x: 1500, y: 800 };
    vi.advanceTimersByTime(1000);
    expect(mocks.windows[0].bounds).toEqual(lastPosition);
  });

  it('ends an interrupted drag when either window is destroyed', () => {
    mocks.handlers.get('pet:drag-start')?.();
    mocks.windows[1].destroyed = true;
    vi.advanceTimersByTime(32);
    expect(mocks.windows[0].setBounds).not.toHaveBeenCalled();
  });
});
