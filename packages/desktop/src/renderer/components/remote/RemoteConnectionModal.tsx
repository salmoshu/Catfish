/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Radio, Select, Spin, Tabs } from '@arco-design/web-react';
import { Check, Caution } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type {
  RemoteConnectionStage,
  RemoteEnvironmentDiscovery,
  RemoteEnvironmentInput,
  RemoteEnvironmentSummary,
  RemoteHostKeyApproval,
  RemoteHostKeyDetails,
} from '@/common/types/remote';
import { AionModal } from '@/renderer/components/base';
import styles from './RemoteConnectionModal.module.css';

type ConnectionKind = 'ssh' | 'wsl' | 'docker';
type Phase = 'form' | 'progress' | 'hostKey';
type ConnectionError = { code: string; message: string };
type HostKeyState = { details: RemoteHostKeyDetails; allowChange: boolean; failurePhase: 'form' | 'progress' };

type RemoteConnectionModalProps = {
  visible: boolean;
  environment?: RemoteEnvironmentSummary;
  onClose: () => void;
  onConnected: () => void;
};

const stages: Array<{ id: Exclude<RemoteConnectionStage, 'connected'>; key: string }> = [
  { id: 'connecting', key: 'stageConnecting' },
  { id: 'detecting', key: 'stageDetecting' },
  { id: 'installing', key: 'stageInstalling' },
  { id: 'starting', key: 'stageStarting' },
];

const RemoteConnectionModal: React.FC<RemoteConnectionModalProps> = ({
  visible,
  environment,
  onClose,
  onConnected,
}) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ConnectionKind>('ssh');
  const [phase, setPhase] = useState<Phase>('form');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState('');
  const [authType, setAuthType] = useState<'password' | 'privateKey'>('password');
  const [password, setPassword] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [distribution, setDistribution] = useState<string>();
  const [linuxUser, setLinuxUser] = useState('');
  const [container, setContainer] = useState('');
  const [dockerMode, setDockerMode] = useState<'running' | 'manual'>('running');
  const [discovery, setDiscovery] = useState<RemoteEnvironmentDiscovery>();
  const [environmentId, setEnvironmentId] = useState<string>();
  const [stage, setStage] = useState<RemoteConnectionStage>('connecting');
  const [error, setError] = useState<ConnectionError>();
  const [hostKey, setHostKey] = useState<HostKeyState>();

  const refreshDiscovery = useCallback(() => {
    ipcBridge.remoteEnvironment.discover
      .invoke()
      .then(setDiscovery)
      .catch((discoveryError: unknown) => {
        setError({ code: 'discovery_failed', message: String(discoveryError) });
      });
  }, []);

  const connectTo = useCallback(
    async (id: string, approval: RemoteHostKeyApproval | undefined, failurePhase: 'form' | 'progress') => {
      setEnvironmentId(id);
      setPhase('progress');
      setStage('connecting');
      setError(undefined);
      setHostKey(undefined);
      const result = await ipcBridge.remoteEnvironment.connect.invoke({ id, hostKeyApproval: approval });
      if (result.ok === true) {
        onConnected();
        return;
      }
      if (result.hostKey) {
        setHostKey({
          details: result.hostKey,
          allowChange: result.code === 'host_key_mismatch',
          failurePhase,
        });
        setPhase('hostKey');
        return;
      }
      setError({ code: result.code, message: result.message });
      setPhase(failurePhase);
    },
    [onConnected]
  );

  const environmentIdToConnect = environment?.id;
  useEffect(() => {
    if (!visible) return;
    setError(undefined);
    setHostKey(undefined);
    setEnvironmentId(environmentIdToConnect);
    setStage('connecting');
    refreshDiscovery();
    if (environmentIdToConnect) {
      setPhase('progress');
      void connectTo(environmentIdToConnect, undefined, 'progress');
      return;
    }
    setPhase('form');
    setKind('ssh');
    setHost('');
    setPort(22);
    setUsername('');
    setAuthType('password');
    setPassword('');
    setPrivateKeyPath('');
    setPassphrase('');
    setDistribution(undefined);
    setLinuxUser('');
    setContainer('');
    setDockerMode('running');
  }, [connectTo, environmentIdToConnect, refreshDiscovery, visible]);

  useEffect(() => {
    if (!visible || !environmentId) return;
    return ipcBridge.remoteEnvironment.progress.on((progress) => {
      if (progress.environmentId === environmentId) setStage(progress.stage);
    });
  }, [environmentId, visible]);

  const input = useMemo((): RemoteEnvironmentInput => {
    if (kind === 'ssh') {
      return {
        kind,
        host: host.trim(),
        port,
        username: username.trim(),
        authType,
        ...(authType === 'password' ? { password } : { privateKeyPath, passphrase: passphrase || undefined }),
      };
    }
    if (kind === 'wsl') return { kind, distribution: distribution || undefined, user: linuxUser.trim() || undefined };
    return { kind, container: container.trim(), user: linuxUser.trim() || undefined };
  }, [authType, container, distribution, host, kind, linuxUser, passphrase, password, port, privateKeyPath, username]);

  const submit = async () => {
    const valid =
      kind === 'wsl' ||
      (kind === 'docker' && container.trim()) ||
      (kind === 'ssh' &&
        host.trim() &&
        username.trim() &&
        Number.isInteger(port) &&
        port > 0 &&
        port <= 65535 &&
        (authType === 'password' ? password : privateKeyPath));
    if (!valid) {
      setError({ code: 'invalid_input', message: '' });
      return;
    }
    setError(undefined);
    const result = await ipcBridge.remoteEnvironment.save.invoke(input);
    if (result.ok === false) {
      setError({ code: result.code, message: result.message });
      return;
    }
    await connectTo(result.data.id, undefined, 'progress');
  };

  const handleClose = () => {
    if (phase === 'progress' && !error) void ipcBridge.remoteEnvironment.cancel.invoke();
    onClose();
  };

  const selectPrivateKey = async () => {
    const selected = await ipcBridge.remoteEnvironment.selectPrivateKey.invoke();
    if (selected) setPrivateKeyPath(selected);
  };

  const errorText = error
    ? error.code === 'invalid_input'
      ? t('guid.workspace.remote.validationRequired')
      : error.code === 'encryption_unavailable'
        ? t('guid.workspace.remote.secureStorageUnavailable')
        : error.code === 'cancelled'
          ? t('guid.workspace.remote.connectionCancelled')
          : t('guid.workspace.remote.connectFailed')
    : '';

  const footer =
    phase === 'hostKey' && hostKey ? (
      <div className='flex justify-end gap-10px'>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          type='primary'
          onClick={() => {
            if (!environmentId) return;
            void connectTo(
              environmentId,
              { fingerprint: hostKey.details.fingerprint, allowChange: hostKey.allowChange },
              hostKey.failurePhase
            );
          }}
        >
          {hostKey.allowChange
            ? t('guid.workspace.remote.replaceAndContinue')
            : t('guid.workspace.remote.trustAndContinue')}
        </Button>
      </div>
    ) : phase === 'progress' ? (
      <div className='flex justify-end gap-10px'>
        <Button onClick={handleClose}>{t('common.cancel')}</Button>
        {error && (
          <Button type='primary' onClick={() => environmentId && void connectTo(environmentId, undefined, 'progress')}>
            {t('guid.workspace.remote.retry')}
          </Button>
        )}
      </div>
    ) : (
      <div className='flex justify-end gap-10px'>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button type='primary' onClick={() => void submit()}>
          {t('guid.workspace.remote.addAndConnect')}
        </Button>
      </div>
    );

  const currentStage = stage === 'connected' ? stages.length : stages.findIndex((item) => item.id === stage);

  return (
    <AionModal
      visible={visible}
      variant='standard'
      wrapClassName='remote-environment-modal'
      className={styles.modal}
      style={{ width: 640, height: 'auto', maxHeight: 'calc(100vh - 64px)' }}
      maskClosable={false}
      header={{
        title: environment?.name || t('guid.workspace.remote.createTitle'),
        subtitle:
          phase === 'progress'
            ? t('guid.workspace.remote.agentHint')
            : kind === 'ssh'
              ? 'user@host:22'
              : kind === 'wsl'
                ? t('guid.workspace.remote.defaultDistribution')
                : t('guid.workspace.remote.runningContainers'),
      }}
      footer={footer}
      onCancel={handleClose}
    >
      {phase === 'hostKey' && hostKey && (
        <div>
          <Alert
            type={hostKey.allowChange ? 'error' : 'warning'}
            icon={<Caution size={18} />}
            title={
              hostKey.allowChange ? t('guid.workspace.remote.hostKeyChanged') : t('guid.workspace.remote.hostKeyNew')
            }
          />
          <dl className={styles.hostKeyDetails}>
            <dt>{t('guid.workspace.remote.host')}</dt>
            <dd>{`${hostKey.details.host}:${hostKey.details.port}`}</dd>
            <dt>{t('guid.workspace.remote.fingerprint')}</dt>
            <dd className={styles.fingerprint}>{hostKey.details.fingerprint}</dd>
            {hostKey.details.expectedFingerprint && (
              <>
                <dt>{t('guid.workspace.remote.savedFingerprint')}</dt>
                <dd className={styles.fingerprint}>{hostKey.details.expectedFingerprint}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {phase === 'progress' && (
        <div>
          <div className={styles.stageList}>
            {stages.map((item, index) => {
              const complete = index < currentStage;
              const current = index === currentStage && !error;
              return (
                <div key={item.id} className={styles.stageRow} data-active={current}>
                  <span className={styles.stageIcon}>
                    {complete ? (
                      <Check size={16} />
                    ) : current ? (
                      <Spin size={14} />
                    ) : (
                      <span className={styles.pendingDot} />
                    )}
                  </span>
                  <span>{t(`guid.workspace.remote.${item.key}`)}</span>
                </div>
              );
            })}
          </div>
          {!error && <Alert type='info' title={t('guid.workspace.remote.installHint')} />}
          {error && <Alert type='error' title={errorText} content={error.message || undefined} />}
        </div>
      )}

      {phase === 'form' && (
        <div>
          <Tabs activeTab={kind} onChange={(key) => setKind(key as ConnectionKind)} className='mb-16px'>
            <Tabs.TabPane key='ssh' title='SSH' />
            <Tabs.TabPane key='wsl' title='WSL' />
            <Tabs.TabPane key='docker' title='Docker' />
          </Tabs>
          {error && <Alert className='mb-16px' type='error' title={errorText} content={error.message || undefined} />}
          <Form layout='vertical'>
            {kind === 'ssh' && (
              <>
                <div className={styles.hostGrid}>
                  <Form.Item label={t('guid.workspace.remote.host')} required>
                    <Input
                      value={host}
                      onChange={setHost}
                      placeholder={t('guid.workspace.remote.hostPlaceholder')}
                      autoComplete='off'
                    />
                  </Form.Item>
                  <Form.Item label={t('guid.workspace.remote.port')} required>
                    <InputNumber value={port} onChange={(value) => setPort(value ?? 22)} min={1} max={65535} />
                  </Form.Item>
                </div>
                <Form.Item label={t('guid.workspace.remote.username')} required>
                  <Input
                    value={username}
                    onChange={setUsername}
                    placeholder={t('guid.workspace.remote.usernamePlaceholder')}
                    autoComplete='off'
                  />
                </Form.Item>
                <Form.Item label={t('guid.workspace.remote.authType')}>
                  <Radio.Group type='button' value={authType} onChange={setAuthType}>
                    <Radio value='password'>{t('guid.workspace.remote.password')}</Radio>
                    <Radio value='privateKey'>{t('guid.workspace.remote.privateKey')}</Radio>
                  </Radio.Group>
                </Form.Item>
                {authType === 'password' ? (
                  <Form.Item label={t('guid.workspace.remote.password')} required>
                    <Input.Password
                      value={password}
                      onChange={setPassword}
                      placeholder={t('guid.workspace.remote.passwordPlaceholder')}
                      autoComplete='new-password'
                    />
                  </Form.Item>
                ) : (
                  <>
                    <Form.Item label={t('guid.workspace.remote.privateKeyPath')} required>
                      <div className='flex gap-8px'>
                        <Input
                          value={privateKeyPath}
                          onChange={setPrivateKeyPath}
                          placeholder={t('guid.workspace.remote.privateKeyPlaceholder')}
                        />
                        <Button onClick={() => void selectPrivateKey()}>{t('guid.workspace.remote.chooseFile')}</Button>
                      </div>
                    </Form.Item>
                    <Form.Item label={t('guid.workspace.remote.passphrase')}>
                      <Input.Password value={passphrase} onChange={setPassphrase} autoComplete='new-password' />
                    </Form.Item>
                  </>
                )}
              </>
            )}

            {kind === 'wsl' && (
              <>
                <Form.Item label={t('guid.workspace.remote.distribution')}>
                  <Select
                    value={distribution}
                    onChange={setDistribution}
                    allowClear
                    placeholder={t('guid.workspace.remote.defaultDistribution')}
                    options={(discovery?.wsl.distributions ?? []).map((name) => ({ label: name, value: name }))}
                  />
                </Form.Item>
                {discovery?.wsl.distributions.length === 0 && (
                  <Alert
                    className='mb-16px'
                    type='warning'
                    title={t('guid.workspace.remote.wslUnavailable')}
                    content={discovery.wsl.error}
                  />
                )}
                <Form.Item label={t('guid.workspace.remote.linuxUser')} extra={t('guid.workspace.remote.userHint')}>
                  <Input
                    value={linuxUser}
                    onChange={setLinuxUser}
                    placeholder={t('guid.workspace.remote.defaultUser')}
                  />
                </Form.Item>
              </>
            )}

            {kind === 'docker' && (
              <>
                <Form.Item>
                  <Radio.Group type='button' value={dockerMode} onChange={setDockerMode}>
                    <Radio value='running'>{t('guid.workspace.remote.runningContainers')}</Radio>
                    <Radio value='manual'>{t('guid.workspace.remote.manualContainer')}</Radio>
                  </Radio.Group>
                </Form.Item>
                <Form.Item label={t('guid.workspace.remote.container')} required>
                  {dockerMode === 'running' ? (
                    <Select
                      value={container}
                      onChange={setContainer}
                      showSearch
                      placeholder={t('guid.workspace.remote.containerPlaceholder')}
                      options={(discovery?.docker.containers ?? []).map((item) => ({
                        label: `${item.name} · ${item.image}`,
                        value: item.name,
                      }))}
                    />
                  ) : (
                    <Input
                      value={container}
                      onChange={setContainer}
                      placeholder={t('guid.workspace.remote.containerPlaceholder')}
                    />
                  )}
                </Form.Item>
                {dockerMode === 'running' && discovery?.docker.containers.length === 0 && (
                  <Alert
                    className='mb-16px'
                    type='info'
                    title={t('guid.workspace.remote.dockerUnavailable')}
                    content={discovery.docker.error}
                  />
                )}
                <Form.Item
                  label={t('guid.workspace.remote.linuxUser')}
                  extra={t('guid.workspace.remote.containerUserHint')}
                >
                  <Input
                    value={linuxUser}
                    onChange={setLinuxUser}
                    placeholder={t('guid.workspace.remote.defaultUser')}
                  />
                </Form.Item>
              </>
            )}
          </Form>
        </div>
      )}
    </AionModal>
  );
};

export default RemoteConnectionModal;
