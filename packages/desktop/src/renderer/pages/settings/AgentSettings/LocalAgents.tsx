/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { parseError } from '@/common/utils';
import type { RemoteEnvironmentSummary } from '@/common/types/remote';
import {
  formatManagedAgentDiagnosticMessage,
  managedAgentSearchText,
  type ManagedAgent,
} from '@/renderer/utils/model/agentTypes';
import AionModal from '@/renderer/components/base/AionModal';
import { AionSearchInput } from '@/renderer/components/base';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useManagedAgents } from '@/renderer/hooks/agent/useManagedAgents';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button, Dropdown, Menu, Message, Typography } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import TalkToButlerButton from '@/renderer/components/base/TalkToButlerButton';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AgentCard from './AgentCard';
import { isDeprecatedRuntimeAgentType } from '@/renderer/utils/model/agentTypeSupportPolicy';
import InlineAgentEditor, { type CustomAgentDraft } from './InlineAgentEditor';
import { getBoundAssistants, useAssistantsForAgents } from './BoundAssistants';
import SettingsPageHeader from '../components/SettingsPageHeader';
import { useNavigate } from 'react-router-dom';
import {
  filterAgentsByAvailability,
  getAgentAvailabilityFilterStats,
  mergeManagedAgentCatalogs,
  type AgentAvailabilityFilter,
} from './agentFilters';

const LOCAL_AGENT_SETUP_GUIDE_URL = 'https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup';

const LocalAgents: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [testingAgentId, setTestingAgentId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<AgentAvailabilityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('local');
  const [environments, setEnvironments] = useState<RemoteEnvironmentSummary[]>([]);
  const [remoteAgents, setRemoteAgents] = useState<ManagedAgent[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const { assistants } = useAssistantsForAgents();

  const {
    agents: localAgents,
    isRefreshing: localRefreshing,
    refreshCatalog: refreshLocalCatalog,
  } = useManagedAgents();
  const isRemote = location !== 'local';

  useEffect(() => {
    const provider = ipcBridge.remoteEnvironment?.list;
    if (!provider) return;
    void provider
      .invoke()
      .then(setEnvironments)
      .catch(() => setEnvironments([]));
  }, []);

  const refreshCatalog = useCallback(async (): Promise<ManagedAgent[] | undefined> => {
    if (!isRemote) return refreshLocalCatalog();
    const agents = await ipcBridge.remoteEnvironment.agents.invoke({ id: location });
    setRemoteAgents(agents);
    return agents;
  }, [isRemote, location, refreshLocalCatalog]);

  useEffect(() => {
    if (!isRemote) return;
    let cancelled = false;
    setRemoteLoading(true);
    void refreshCatalog()
      .catch(() => {
        if (!cancelled) {
          setRemoteAgents([]);
          Message.error(t('settings.agentManagement.remoteAgentsLoadFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isRemote, refreshCatalog, t]);

  const allAgents = isRemote ? mergeManagedAgentCatalogs(localAgents, remoteAgents) : localAgents;
  const isRefreshing = localRefreshing || remoteLoading;

  // Hide deprecated runtime backends (nanobot / openclaw-gateway / remote / gemini)
  // — they are no longer offered as agents and shouldn't appear on the detection page.
  const officialAgents = allAgents.filter(
    (a) => a.agent_source !== 'custom' && !isDeprecatedRuntimeAgentType(a.agent_type)
  );

  const customAgents: ManagedAgent[] = allAgents
    .filter((a) => a.agent_source === 'custom')
    .toSorted((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ManagedAgent | null>(null);

  const handleSaveCustomAgent = useCallback(
    async (draft: CustomAgentDraft) => {
      const body = {
        name: draft.name,
        command: draft.command,
        icon: draft.icon,
        args: draft.args,
        env: draft.env,
        advanced: draft.advanced,
      };
      try {
        if (editingAgent) {
          await ipcBridge.acpConversation.updateCustomAgent.invoke({ id: editingAgent.id, ...body });
        } else {
          await ipcBridge.acpConversation.createCustomAgent.invoke(body);
        }
        await refreshCatalog();
        setEditorVisible(false);
        setEditingAgent(null);
      } catch (err) {
        console.error('save custom agent failed:', err);
        Message.error(parseError(err));
      }
    },
    [editingAgent, refreshCatalog]
  );

  const handleDeleteCustomAgent = useCallback(
    async (agentId: string) => {
      try {
        await ipcBridge.acpConversation.deleteCustomAgent.invoke({ id: agentId });
        await refreshCatalog();
      } catch (err) {
        console.error('delete custom agent failed:', err);
        Message.error(parseError(err));
      }
    },
    [refreshCatalog]
  );

  const handleToggleCustomAgent = useCallback(
    async (agentId: string, enabled: boolean) => {
      try {
        await ipcBridge.acpConversation.setAgentEnabled.invoke({ id: agentId, enabled });
        await refreshCatalog();
      } catch (err) {
        console.error('toggle custom agent failed:', err);
        Message.error(parseError(err));
      }
    },
    [refreshCatalog]
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const matchesAgentSearch = useCallback(
    (agent: ManagedAgent) => {
      if (!normalizedSearchQuery) return true;
      return managedAgentSearchText(agent, i18n.language).includes(normalizedSearchQuery);
    },
    [i18n.language, normalizedSearchQuery]
  );

  const sortedOfficialAgents = useMemo(
    () =>
      officialAgents.toSorted((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })),
    [officialAgents]
  );
  const officialFilterStats = getAgentAvailabilityFilterStats(sortedOfficialAgents);
  const visibleOfficialAgents = filterAgentsByAvailability(
    sortedOfficialAgents.filter(matchesAgentSearch),
    agentFilter
  );
  const visibleCustomAgents = customAgents.filter(matchesAgentSearch);

  const openCustomAgentEditor = useCallback(() => {
    setEditingAgent(null);
    setEditorVisible(true);
  }, []);

  const openAgentConfig = useCallback(
    (agentId: string) => {
      navigate(`/settings/agent/${agentId}/repair`);
    },
    [navigate]
  );

  // Manual "test connection": runs the live ACP probe (initialize +
  // session/new) and refreshes the catalog so the card reflects the new
  // status immediately (F2-02: three states stay clickable, in-progress
  // feedback, recover-on-success).
  const handleTestConnection = useCallback(
    async (agentId: string) => {
      try {
        setTestingAgentId(agentId);
        const result = isRemote
          ? await ipcBridge.remoteEnvironment.checkAgent.invoke({ environmentId: location, agentId })
          : await ipcBridge.acpConversation.checkManagedAgentHealthById.invoke({ id: agentId });
        await refreshCatalog();
        switch (result.status) {
          case 'online':
            Message.success(t('settings.agentManagement.testConnectionOnline', { name: result.name }));
            break;
          case 'missing':
            Message.warning(t('settings.agentManagement.testConnectionMissing', { name: result.name }));
            break;
          case 'offline':
            // auth_required is offline-with-a-reason: surface the diagnostic
            // (which carries the "needs sign-in" guidance) when present.
            Message.warning(
              formatManagedAgentDiagnosticMessage(t, result) ||
                (result.last_check_error_code === 'auth_required'
                  ? t('settings.agentManagement.testConnectionAuth', { name: result.name })
                  : t('settings.agentManagement.testConnectionOffline', { name: result.name }))
            );
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('test managed agent failed:', error);
        Message.error(t('settings.agentManagement.testConnectionError'));
      } finally {
        setTestingAgentId(null);
      }
    },
    [isRemote, location, refreshCatalog, t]
  );

  const locationLabel = isRemote
    ? (environments.find((environment) => environment.id === location)?.name ?? location)
    : t('guid.workspace.remote.local');
  const locationMenu = (
    <Menu onClickMenuItem={(key) => setLocation(String(key))}>
      <Menu.Item key='local'>{t('guid.workspace.remote.local')}</Menu.Item>
      {environments.map((environment) => (
        <Menu.Item key={environment.id}>
          {environment.name} · {environment.kind.toUpperCase()}
        </Menu.Item>
      ))}
    </Menu>
  );

  return (
    <div data-testid='agent-management-page' className='flex flex-col gap-16px'>
      <SettingsPageHeader
        data-testid='agent-management-header'
        title={
          <span className='inline-flex h-26px items-center gap-6px align-middle'>
            {t('settings.agents', { defaultValue: 'Agents' })}
            <Dropdown droplist={locationMenu} trigger='click'>
              <Button
                type='text'
                size='mini'
                aria-label={t('settings.agentManagement.environment')}
                className='!h-24px !px-6px !text-12px !font-normal !text-t-secondary'
              >
                {locationLabel}
                <Down size={11} className='ms-4px' />
              </Button>
            </Dropdown>
          </span>
        }
        description={
          <>
            <span>
              {t(
                isRemote
                  ? 'settings.agentManagement.remoteAgentsDescription'
                  : 'settings.agentManagement.localAgentsDescription'
              )}{' '}
            </span>
            <Button
              type='text'
              size='mini'
              className='!h-auto !p-0 !align-baseline !text-13px !font-normal !text-primary-6 hover:!text-primary-7 hover:!underline underline-offset-2'
              onClick={() => {
                void openExternalUrl(LOCAL_AGENT_SETUP_GUIDE_URL).catch(console.error);
              }}
            >
              {t('settings.agentManagement.localAgentsSetupLink')}
            </Button>
          </>
        }
        actions={
          <>
            {!isMobile && (
              <AionSearchInput
                className='shrink-0 w-[200px] hidden md:flex'
                data-testid='input-search-agents'
                placeholder={t('settings.agentManagement.searchPlaceholder', { defaultValue: 'Search agents...' })}
                value={searchQuery}
                onChange={setSearchQuery}
              />
            )}
            {!isRemote && (
              <TalkToButlerButton
                label={t('settings.agentManagement.addCustomAgent', { defaultValue: 'Add custom Agent' })}
                chatLabel={t('settings.talkToButler.addViaChat', { defaultValue: 'Add via chat' })}
                onManual={openCustomAgentEditor}
                manualLabel={t('settings.talkToButler.addManually', { defaultValue: 'Add manually' })}
                prompt={t('settings.talkToButler.prompt.addCustomAgent', {
                  defaultValue: 'Help me add a custom Agent.',
                })}
                data-testid='btn-add-custom-agent'
              />
            )}
          </>
        }
        tabs={[
          {
            key: 'all',
            label: t('settings.agentManagement.filterAll', { defaultValue: 'All' }),
            count: officialFilterStats.all,
          },
          {
            key: 'available',
            label: t('settings.agentManagement.filterAvailable', { defaultValue: 'Available' }),
            count: officialFilterStats.available,
          },
          {
            key: 'unavailable',
            label: t('settings.agentManagement.filterUnavailable', { defaultValue: 'Unavailable' }),
            count: officialFilterStats.unavailable,
          },
        ]}
        activeTab={agentFilter}
        onTabChange={(key) => setAgentFilter(key as AgentAvailabilityFilter)}
      />

      {isRefreshing ? (
        <div className='text-11px text-t-tertiary'>{t('settings.agentManagement.refreshingStatuses')}</div>
      ) : null}

      {/* Detected Agents section */}
      <div data-testid='agent-management-official-section'>
        <div className='flex flex-col gap-8px rounded-12px border border-border-2 bg-2 p-8px md:rounded-16px md:p-10px'>
          {visibleOfficialAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              type='official'
              agent={agent}
              boundAssistants={isRemote ? [] : getBoundAssistants(agent, assistants)}
              onTestConnection={() => void handleTestConnection(agent.id)}
              onConfigure={isRemote ? undefined : () => openAgentConfig(agent.id)}
              isTesting={testingAgentId === agent.id}
            />
          ))}
          {visibleOfficialAgents.length === 0 && (
            <Typography.Text type='secondary' className='block py-16px text-center text-12px'>
              {normalizedSearchQuery
                ? t('settings.agentManagement.noSearchResults', { defaultValue: 'No matching agents.' })
                : t(
                    isRemote
                      ? 'settings.agentManagement.remoteAgentsEmpty'
                      : 'settings.agentManagement.localAgentsEmpty'
                  )}
            </Typography.Text>
          )}
        </div>
      </div>

      {!isRemote && (
        <div data-testid='agent-management-custom-header' className='flex flex-col gap-2px'>
          <Typography.Text className='text-13px font-medium text-t-secondary block'>
            {t('settings.agentManagement.customAgents', { defaultValue: 'Custom Agents' })}
          </Typography.Text>
          <Typography.Text className='block text-12px text-t-tertiary'>
            {t('settings.agentManagement.customEmptyDescription')}
          </Typography.Text>
        </div>
      )}

      <AionModal
        visible={editorVisible}
        onCancel={() => {
          setEditorVisible(false);
          setEditingAgent(null);
        }}
        header={{
          title: editingAgent
            ? t('settings.agentManagement.editCustomAgent')
            : t('settings.agentManagement.detectCustomAgent'),
          showClose: true,
        }}
        footer={null}
        style={{ maxWidth: '92vw', borderRadius: 16 }}
        contentStyle={{
          background: 'var(--dialog-fill-0)',
          borderRadius: 16,
          padding: '20px 24px 16px',
          overflow: 'auto',
        }}
      >
        {/* Conditional mount + key unmounts the editor on close so the
            next `创建自定义 Agent` click always starts from a blank form.
            The inner useEffect([agent]) only resets when the `agent`
            reference changes; two consecutive `null` values would not
            retrigger it. */}
        {editorVisible && (
          <InlineAgentEditor
            key={editingAgent?.id ?? 'new'}
            agent={editingAgent}
            onSave={(agent) => void handleSaveCustomAgent(agent)}
            onCancel={() => {
              setEditorVisible(false);
              setEditingAgent(null);
            }}
          />
        )}
      </AionModal>

      {!isRemote && (
        <div data-testid='agent-management-custom-section'>
          <div className='flex flex-col gap-8px rounded-12px border border-border-2 bg-2 p-8px md:rounded-16px md:p-10px'>
            {visibleCustomAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                type='custom'
                agent={agent}
                boundAssistants={getBoundAssistants(agent, assistants)}
                onTestConnection={() => void handleTestConnection(agent.id)}
                onConfigure={() => openAgentConfig(agent.id)}
                isTesting={testingAgentId === agent.id}
                onEdit={() => {
                  setEditingAgent(agent);
                  setEditorVisible(true);
                }}
                onDelete={() => void handleDeleteCustomAgent(agent.id)}
                onToggle={(enabled) => void handleToggleCustomAgent(agent.id, enabled)}
              />
            ))}
            {visibleCustomAgents.length === 0 ? (
              <Typography.Text type='secondary' className='block py-12px text-center text-12px'>
                {normalizedSearchQuery
                  ? t('settings.agentManagement.noSearchResults', { defaultValue: 'No matching agents.' })
                  : t('settings.agentManagement.customEmpty')}
              </Typography.Text>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default LocalAgents;
