/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import type { AcpConfigOptionDto } from '@/common/types/platform/acpTypes';
import { Message, Modal, Select } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deriveSelectOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { getManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';
import {
  buildAgentRuntimeModeState,
  buildAgentRuntimeModelInfo,
  getAgentRuntimeConfigOptions,
} from '@/renderer/utils/model/agentRuntimeCatalog';
import type { ForkConversationOptions } from '@/renderer/hooks/chat/useForkConversation';

type ForkConversationDialogProps = {
  sourceConversationId?: string;
  sourceBackend?: string;
  sourceAssistantId?: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (options: ForkConversationOptions) => void;
};

const ForkConversationDialog: React.FC<ForkConversationDialogProps> = ({
  sourceConversationId,
  sourceBackend,
  sourceAssistantId,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<Assistant[]>([]);
  const [catalog, setCatalog] = useState<ManagedAgent[]>([]);
  const [sourceOptions, setSourceOptions] = useState<AcpConfigOptionDto[]>([]);
  const [target, setTarget] = useState('');
  const [model, setModel] = useState<string>();
  const [thoughtLevel, setThoughtLevel] = useState<string>();
  const [mode, setMode] = useState<string>();

  useEffect(() => {
    let disposed = false;
    void Promise.all([ipcBridge.assistants.list.invoke(), getManagedAgents()])
      .then(([assistants, agents]) => {
        if (disposed) return;
        const selectable = selectableAssistants(assistants).filter(
          (assistant) => assistant.agent_status !== 'missing' && assistant.agent?.type !== 'remote'
        );
        const unique = selectable.filter(
          (assistant, index) => selectable.findIndex((other) => other.agent_id === assistant.agent_id) === index
        );
        setTargets(unique);
        setCatalog(agents);
      })
      .catch((error) => {
        if (!disposed) Message.error(t('messages.fork.errorGeneric', { message: String(error) }));
      });
    return () => {
      disposed = true;
    };
  }, [t]);

  // The conversation's live runtime is the authoritative option source for the
  // current agent. The management catalog only carries whatever was captured at
  // the last handshake, which is often empty until a session has started.
  useEffect(() => {
    if (!sourceConversationId) return;
    let disposed = false;
    void ipcBridge.conversation.ensureRuntime
      .invoke({ conversation_id: sourceConversationId })
      .then((runtime) => {
        if (!disposed) setSourceOptions(runtime.config_options ?? []);
      })
      .catch((): void => undefined);
    return () => {
      disposed = true;
    };
  }, [sourceConversationId]);

  const runtimeKey = useMemo(() => {
    if (target) return assistantRuntimeKey(targets.find((assistant) => assistant.agent_id === target));
    const source = targets.find((assistant) => assistant.id === sourceAssistantId);
    return assistantRuntimeKey(source) || sourceBackend || '';
  }, [sourceAssistantId, sourceBackend, target, targets]);
  const runtimeAgent = useMemo(
    () => catalog.find((agent) => agent.id === runtimeKey || agent.backend === runtimeKey),
    [catalog, runtimeKey]
  );
  // Use the live source runtime while the current agent is selected; a different
  // target falls back to its persisted handshake catalog.
  const modelInfo = useMemo(() => buildAgentRuntimeModelInfo(runtimeAgent), [runtimeAgent]);
  const sourceModelOption = useMemo(
    () => (target ? null : deriveSelectOption(sourceOptions, 'model', ['model'])),
    [sourceOptions, target]
  );
  const sourceModeOption = useMemo(
    () => (target ? null : deriveSelectOption(sourceOptions, 'mode', ['mode'])),
    [sourceOptions, target]
  );
  const modeState = useMemo(() => buildAgentRuntimeModeState(runtimeAgent), [runtimeAgent]);
  const thoughtOption = useMemo(() => {
    const options = getAgentRuntimeConfigOptions(runtimeAgent).map((option) => ({
      id: option.id,
      category: option.category,
      type: option.type,
      current_value: option.current_value,
      selected_value: option.selected_value,
      options: option.options ?? [],
    }));
    return target
      ? deriveSelectOption(options, 'thought_level', ['thought_level', 'reasoning_effort'])
      : deriveSelectOption(sourceOptions, 'thought_level', ['thought_level', 'reasoning_effort']);
  }, [runtimeAgent, sourceOptions, target]);

  const selectedAssistant = useMemo(
    () => targets.find((assistant) => assistant.agent_id === target),
    [target, targets]
  );
  const models = useMemo(() => {
    if (!target && sourceModelOption?.options.length) {
      return sourceModelOption.options.map((option) => ({ id: option.value, label: option.label }));
    }
    if (modelInfo?.available_models.length) {
      return modelInfo.available_models.map((item) => ({ id: item.id, label: item.label || item.id }));
    }
    return (selectedAssistant?.models ?? []).map((id) => ({ id, label: id }));
  }, [modelInfo, selectedAssistant, sourceModelOption, target]);
  const modes = useMemo(
    () => (target ? modeState.options : (sourceModeOption?.options ?? [])),
    [modeState.options, sourceModeOption, target]
  );
  const thoughtLevels = useMemo(() => thoughtOption?.options ?? [], [thoughtOption]);

  const defaultModel = sourceModelOption?.currentValue ?? modelInfo?.current_model_id ?? models[0]?.id;
  const defaultThoughtLevel = thoughtOption?.currentValue ?? thoughtLevels[0]?.value;
  const defaultMode = sourceModeOption?.currentValue ?? modeState.currentMode ?? modes[0]?.value;

  useEffect(() => {
    setModel(defaultModel ?? undefined);
  }, [defaultModel]);
  useEffect(() => {
    setThoughtLevel(defaultThoughtLevel ?? undefined);
  }, [defaultThoughtLevel]);
  useEffect(() => {
    setMode(defaultMode ?? undefined);
  }, [defaultMode]);

  const unavailablePlaceholder = t('messages.fork.optionsUnavailable', {
    defaultValue: 'Available after the forked session connects',
  });

  return (
    <Modal
      visible
      title={t('messages.fork.action')}
      okText={t('messages.fork.startContinuation')}
      cancelText={t('common.cancel')}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() =>
        onSubmit({
          targetAgentId: target || undefined,
          modelId: model,
          thoughtLevel,
          mode,
        })
      }
    >
      <div className='flex flex-col gap-14px'>
        <div className='text-t-secondary'>{t('messages.fork.handoffDescription')}</div>
        <label className='flex flex-col gap-6px'>
          <span className='text-12px text-t-secondary'>{t('messages.fork.targetAgent')}</span>
          <Select
            value={target}
            onChange={setTarget}
            aria-label={t('messages.fork.targetAgent')}
            placeholder={t('messages.fork.targetAgent')}
            options={[
              { value: '', label: t('messages.fork.currentAgent', { defaultValue: 'Current agent' }) },
              ...targets.map((assistant) => ({ value: assistant.agent_id, label: assistant.name })),
            ]}
          />
        </label>
        <label className='flex flex-col gap-6px'>
          <span className='text-12px text-t-secondary'>{t('common.model')}</span>
          <Select
            value={model}
            onChange={setModel}
            aria-label={t('common.model')}
            placeholder={unavailablePlaceholder}
            disabled={models.length === 0}
            options={models.map((item) => ({ value: item.id, label: item.label }))}
          />
        </label>
        <label className='flex flex-col gap-6px'>
          <span className='text-12px text-t-secondary'>{t('agent.thoughtLevel.label')}</span>
          <Select
            value={thoughtLevel}
            onChange={setThoughtLevel}
            aria-label={t('agent.thoughtLevel.label')}
            placeholder={unavailablePlaceholder}
            disabled={thoughtLevels.length === 0}
            options={thoughtLevels.map((item) => ({ value: item.value, label: item.label || item.value }))}
          />
        </label>
        <label className='flex flex-col gap-6px'>
          <span className='text-12px text-t-secondary'>{t('agentMode.switchMode')}</span>
          <Select
            value={mode}
            onChange={setMode}
            aria-label={t('agentMode.switchMode')}
            placeholder={unavailablePlaceholder}
            disabled={modes.length === 0}
            options={modes.map((item) => ({ value: item.value, label: item.label || item.value }))}
          />
        </label>
      </div>
    </Modal>
  );
};

export default ForkConversationDialog;
