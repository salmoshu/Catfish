import { useCallback, useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { isPlatformPrimaryModifier } from '@/renderer/utils/ui/keyboardShortcuts';

type InputSnapshot = { value: string; start: number; end: number };
const MAX_UNDO_STEPS = 200;

/** Keeps controlled draft edits undoable, including programmatic insertions. */
export function useInputUndo(
  value: string,
  onChange: (value: string) => void,
  getTextarea: () => HTMLTextAreaElement | null,
  scope?: string,
  isComposing = false
) {
  const history = useRef<InputSnapshot[]>([{ value, start: value.length, end: value.length }]);
  const index = useRef(0);
  const currentScope = useRef(scope);
  const restoring = useRef<InputSnapshot | null>(null);

  useLayoutEffect(() => {
    if (currentScope.current !== scope) {
      currentScope.current = scope;
      history.current = [{ value, start: value.length, end: value.length }];
      index.current = 0;
      restoring.current = null;
      return;
    }
    if (isComposing) return;
    const target = restoring.current;
    if (target?.value === value) {
      restoring.current = null;
      getTextarea()?.setSelectionRange(target.start, target.end);
      return;
    }
    if (history.current[index.current]?.value === value) return;
    const textarea = getTextarea();
    history.current = history.current.slice(0, index.current + 1);
    history.current.push({
      value,
      start: textarea?.selectionStart ?? value.length,
      end: textarea?.selectionEnd ?? value.length,
    });
    if (history.current.length > MAX_UNDO_STEPS) history.current.shift();
    index.current = history.current.length - 1;
  }, [getTextarea, isComposing, scope, value]);

  const rememberSelection = useCallback(() => {
    const textarea = getTextarea();
    const snapshot = history.current[index.current];
    if (!textarea || !snapshot || snapshot.value !== textarea.value) return;
    snapshot.start = textarea.selectionStart;
    snapshot.end = textarea.selectionEnd;
  }, [getTextarea]);

  const handleUndoKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isPlatformPrimaryModifier(event) || event.altKey || isComposing || event.nativeEvent.isComposing)
        return false;
      const key = event.key.toLowerCase();
      const redo = key === 'y' || (key === 'z' && event.shiftKey);
      if (key !== 'z' && key !== 'y') return false;
      event.preventDefault();
      event.stopPropagation();
      rememberSelection();
      const nextIndex = index.current + (redo ? 1 : -1);
      const snapshot = history.current[nextIndex];
      if (!snapshot) return true;
      index.current = nextIndex;
      restoring.current = snapshot;
      onChange(snapshot.value);
      return true;
    },
    [isComposing, onChange, rememberSelection]
  );

  return { handleUndoKeyDown, rememberSelection };
}
