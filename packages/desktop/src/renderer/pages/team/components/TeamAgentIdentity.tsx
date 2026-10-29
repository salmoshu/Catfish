import React from 'react';
import useSWR from 'swr';
import { resolveAgentAvatar, useAgentLogos } from '@renderer/utils/model/agentLogo';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';
import { usePresetAssistantInfo } from '@renderer/hooks/agent/usePresetAssistantInfo';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { normalizeAssistantDisplayName } from '@renderer/utils/model/assistantDisplay';
import { Robot } from '@icon-park/react';
import KimiIcon from '@renderer/components/base/KimiIcon';

type Props = {
  assistant_name: string;
  assistant_backend: string;
  icon?: string;
  /** When provided, enables preset-aware avatar (emoji / custom svg) via the agent's conversation extras. */
  conversation_id?: string;
  isLeader?: boolean;
  className?: string;
  logoClassName?: string;
  /** Used for emoji presets (text-based avatar) and the first-letter fallback circle. */
  avatarClassName?: string;
  nameClassName?: string;
  nameStyle?: React.CSSProperties;
  nameTestId?: string;
  crownClassName?: string;
  /** 叠加在头像右下角的节点（如状态点）。传入时头像外层为 relative 定位容器。 */
  avatarOverlay?: React.ReactNode;
};

const TeamAgentIdentity: React.FC<Props> = ({
  assistant_name,
  assistant_backend,
  icon,
  conversation_id,
  isLeader = false,
  className,
  logoClassName,
  avatarClassName,
  nameClassName,
  nameStyle,
  nameTestId,
  crownClassName,
  avatarOverlay,
}) => {
  const logos = useAgentLogos();
  // Share the SWR key with AgentChatSlot / TeamChatEmptyState so this hits cache instead of firing a fetch
  const { data: conversation } = useSWR(conversation_id ? ['team-conversation', conversation_id] : null, () =>
    getConversationOrNull(conversation_id!)
  );
  const { info: presetInfo } = usePresetAssistantInfo(conversation ?? undefined);
  const displayName = normalizeAssistantDisplayName(assistant_name || presetInfo?.name) || 'Assistant';
  const agentAvatar = resolveAgentAvatar(logos, { icon, backend: assistant_backend });

  const defaultLogoClassName = 'w-16px h-16px object-contain rounded-2px opacity-80';
  const resolvedLogoClassName = logoClassName ?? defaultLogoClassName;
  const defaultAvatarClassName =
    'w-16px h-16px rounded-2px flex items-center justify-center text-12px leading-none bg-fill-2 shrink-0';
  const resolvedAvatarClassName = avatarClassName ?? defaultAvatarClassName;

  const renderAvatar = () => {
    if (presetInfo) {
      if (presetInfo.isFallback) {
        return (
          <span className={resolvedAvatarClassName}>
            <Robot theme='outline' size={12} />
          </span>
        );
      }
      if (presetInfo.isEmoji) {
        return <span className={resolvedAvatarClassName}>{presetInfo.logo}</span>;
      }
      return <ThemedLogo src={presetInfo.logo} alt={displayName} className={resolvedLogoClassName} />;
    }
    if (agentAvatar.kind === 'image') {
      return <ThemedLogo src={agentAvatar.value} alt={displayName} className={resolvedLogoClassName} />;
    }
    if (agentAvatar.kind === 'emoji') {
      return <span className={resolvedAvatarClassName}>{agentAvatar.value}</span>;
    }
    return (
      <span className={resolvedAvatarClassName}>
        <Robot theme='outline' size={12} />
      </span>
    );
  };

  const crownIcon = (
    <KimiIcon
      name='leader-crown'
      size={15}
      fill='var(--warning)'
      className='block'
      data-testid='team-leader-crown-icon'
    />
  );

  return (
    <div className={['flex items-center gap-8px', className].filter(Boolean).join(' ')}>
      {avatarOverlay ? (
        <span className='relative shrink-0 inline-flex'>
          {renderAvatar()}
          {avatarOverlay}
        </span>
      ) : (
        renderAvatar()
      )}
      <span
        data-testid={nameTestId}
        className={['min-w-0 flex-1 truncate', nameClassName].filter(Boolean).join(' ')}
        style={nameStyle}
      >
        {displayName}
      </span>
      {isLeader && (
        <span
          data-testid='team-leader-crown'
          className={['shrink-0 leading-none drop-shadow-sm', crownClassName].filter(Boolean).join(' ')}
        >
          {crownIcon}
        </span>
      )}
    </div>
  );
};

export default TeamAgentIdentity;
