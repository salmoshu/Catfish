/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
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
  sourceBackend?: string;
  sourceAssistantId?: string;
  defaultToAnotherAgent: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (options: ForkConversationOptions) => void;
};

const ForkConversationDialog: React.FC<ForkConversationDialogProps> = ({
  sourceBackend,
  sourceAssistantId,
  defaultToAnotherAgent,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<Assistant[]>([]);
  const [catalog, setCatalog] = useState<ManagedAgent[]>([]);
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
        if (defaultToAnotherAgent) setTarget(unique[0]?.agent_id ?? '');
      })
      .catch((error) => {
        if (!disposed) Message.error(t('messages.fork.errorGeneric', { message: String(error) }));
      });
    return () => {
      disposed = true;
    };
  }, [defaultToAnotherAgent, t]);

  const runtimeKey = useMemo(() => {
    if (target) return assistantRuntimeKey(targets.find((assistant) => assistant.agent_id === target));
    const source = targets.find((assistant) => assistant.id === sourceAssistantId);
    return assistantRuntimeKey(source) || sourceBackend || '';
  }, [sourceAssistantId, sourceBackend, target, targets]);
  const runtimeAgent = useMemo(
    () => catalog.find((agent) => agent.id === runtimeKey || agent.backend === runtimeKey),
    [catalog, runtimeKey]
  );
  const modelInfo = useMemo(() => buildAgentRuntimeModelInfo(runtimeAgent), [runtimeAgent]);
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
    return deriveSelectOption(options, 'thought_level', ['thought_level', 'reasoning_effort']);
  }, [runtimeAgent]);
  const models = useMemo(() => modelInfo?.available_models ?? [], [modelInfo]);
  const modes = useMemo(() => modeState.options, [modeState]);
  const thoughtLevels = useMemo(() => thoughtOption?.options ?? [], [thoughtOption]);

  useEffect(() => setModel(modelInfo?.current_model_id ?? models[0]?.id), [modelInfo, models]);
  useEffect(
    () => setThoughtLevel(thoughtOption?.currentValue ?? thoughtLevels[0]?.value),
    [thoughtOption, thoughtLevels]
  );
  useEffect(() => setMode(modeState.currentMode ?? modes[0]?.value), [modeState, modes]);

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
        {models.length > 0 && (
          <label className='flex flex-col gap-6px'>
            <span className='text-12px text-t-secondary'>{t('common.model')}</span>
            <Select
              value={model}
              onChange={setModel}
              aria-label={t('common.model')}
              options={models.map((item) => ({ value: item.id, label: item.label || item.id }))}
            />
          </label>
        )}
        {thoughtLevels.length > 0 && (
          <label className='flex flex-col gap-6px'>
            <span className='text-12px text-t-secondary'>{t('agent.thoughtLevel.label')}</span>
            <Select
              value={thoughtLevel}
              onChange={setThoughtLevel}
              aria-label={t('agent.thoughtLevel.label')}
              options={thoughtLevels.map((item) => ({ value: item.value, label: item.label || item.value }))}
            />
          </label>
        )}
        {modes.length > 0 && (
          <label className='flex flex-col gap-6px'>
            <span className='text-12px text-t-secondary'>{t('agentMode.switchMode')}</span>
            <Select
              value={mode}
              onChange={setMode}
              aria-label={t('agentMode.switchMode')}
              options={modes.map((item) => ({ value: item.value, label: item.label || item.value }))}
            />
          </label>
        )}
      </div>
    </Modal>
  );
};

export default ForkConversationDialog;
