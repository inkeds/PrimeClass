'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import {
  BellIcon,
  BookOpenIcon,
  CrownIcon,
  FileTextIcon,
  LogoutIcon,
  SettingsIcon,
  ShieldIcon,
} from '@/components/icons';
import { EmptyState, MenuRow } from '@/components/ui-blocks';
import {
  getDisplaySettings,
  getMe,
  getMembership,
  isUnauthorizedError,
  logoutApp,
  updateMeEmail,
  updateMeNotificationSettings,
} from '@/lib/api';
import type {
  DisplaySettings,
  MeNotificationSettings,
  MePayload,
  MembershipSnapshot,
} from '@/lib/types';
import {
  formatDateLabel,
  getInitial,
  getMembershipLabel,
  getMembershipTone,
  hasVipMembership,
  isPermanentMembership,
} from '@/lib/utils';

type MeDialog = 'account' | 'settings' | 'notifications' | 'docs' | null;

type KnowledgeDoc = {
  id: string;
  category: string;
  title: string;
  content: string;
};

const defaultNotificationSettings: MeNotificationSettings = {
  email_course_update: true,
  email_membership_expiry: true,
  email_system_notice: true,
  in_app_system_notice: true,
};

const knowledgeDocs: KnowledgeDoc[] = [
  {
    id: 'bind-email',
    category: '账号安全',
    title: '如何绑定邮箱',
    content: '在“账号与安全”中填写邮箱并保存即可。当前版本邮箱主要用于接收会员到期、课程更新和系统通知提醒。',
  },
  {
    id: 'vip-redeem',
    category: '会员权益',
    title: '激活码如何兑换',
    content: '进入“我的”页面顶部的 VIP 激活入口，输入激活码后即可开通对应会员权益，系统会自动刷新到期时间。',
  },
  {
    id: 'membership-expire',
    category: '会员权益',
    title: '会员过期后会怎样',
    content: '过期后账号会恢复普通用户权限，已学记录仍会保留。后续可继续通过激活码重新开通 VIP。',
  },
  {
    id: 'notifications',
    category: '消息通知',
    title: '如何调整通知提醒',
    content: '在“设置”中可分别开启课程更新、会员到期、系统公告邮件和站内提醒，保存后立即生效。',
  },
  {
    id: 'course-access',
    category: '学习使用',
    title: '为什么有些课程无法播放',
    content: '部分课程需要 VIP 权益才可观看。如果当前账号未开通会员，会在课程和课时页看到访问限制提示。',
  },
  {
    id: 'learning-sync',
    category: '学习使用',
    title: '学习进度如何同步',
    content: '登录后播放课程，系统会自动记录课时进度与最近学习记录。退出账号或游客状态下不会同步到服务器。',
  },
];

const notificationItems: Array<{
  key: keyof MeNotificationSettings;
  label: string;
  description: string;
}> = [
  {
    key: 'email_course_update',
    label: '课程更新邮件',
    description: '新课上架、专题更新或课程资料变更时，发送邮件提醒。',
  },
  {
    key: 'email_membership_expiry',
    label: '会员到期提醒',
    description: '会员即将到期或已过期时，通过邮箱提醒你及时续期。',
  },
  {
    key: 'email_system_notice',
    label: '系统公告邮件',
    description: '重大维护通知、活动公告和服务变更，通过邮件发送。',
  },
  {
    key: 'in_app_system_notice',
    label: '站内消息提醒',
    description: '保留站内的运营与系统提醒，会显示在当前消息通知面板。',
  },
];

export default function MePage() {
  const { mounted, openRedeem, session, setSession, logout, showToast } = useAppContext();
  const [profile, setProfile] = useState<MePayload | null>(null);
  const [membership, setMembership] = useState<MembershipSnapshot | null>(session?.membership ?? null);
  const [settings, setSettings] = useState<DisplaySettings | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeDialog, setActiveDialog] = useState<MeDialog>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [notificationDraft, setNotificationDraft] = useState<MeNotificationSettings>(defaultNotificationSettings);
  const [accountSaving, setAccountSaving] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [docKeyword, setDocKeyword] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDisplaySettings() {
      const data = await getDisplaySettings();

      if (active) {
        setSettings(data);
      }
    }

    void loadDisplaySettings();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMembership(session?.membership ?? null);
  }, [session?.membership]);

  useEffect(() => {
    const token = session?.token;

    if (!token) {
      setProfile(null);
      setMembership(null);
      return;
    }

    const resolvedToken = token;
    const currentSession = session;

    let active = true;

    async function loadProfile() {
      try {
        const [meData, membershipData] = await Promise.all([
          getMe(resolvedToken),
          getMembership(resolvedToken),
        ]);

        if (!active) {
          return;
        }

        setProfile(meData);
        setMembership(membershipData);

        if (currentSession?.token === resolvedToken) {
          setSession({
            ...currentSession,
            user_info: {
              ...currentSession.user_info,
              user_level: hasVipMembership(membershipData) ? 'vip' : 'normal',
            },
            membership: membershipData,
          });
        }
      } catch (error) {
        if (isUnauthorizedError(error)) {
          logout();
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [logout, session?.token, setSession]);

  useEffect(() => {
    setEmailDraft(profile?.email ?? '');
    setNotificationDraft(profile?.notification_settings ?? defaultNotificationSettings);
  }, [profile]);

  const filteredDocs = useMemo(() => {
    const keyword = docKeyword.trim().toLowerCase();

    if (!keyword) {
      return knowledgeDocs;
    }

    return knowledgeDocs.filter((item) =>
      [item.category, item.title, item.content].some((part) =>
        part.toLowerCase().includes(keyword),
      ),
    );
  }, [docKeyword]);

  const isPermanent = isPermanentMembership(membership);
  const hasVip = hasVipMembership(membership);
  const memberTone = getMembershipTone(membership);
  const memberLabel = getMembershipLabel(membership);
  const vipCardTitle = isPermanent
    ? `${membership?.package_name ?? '永久 VIP'} 已开通`
    : hasVip
      ? `${membership?.package_name ?? 'VIP'} 会员中`
      : 'VIP 激活码兑换';
  const vipCardDescription = isPermanent
    ? '当前账号已解锁同步课与专题课权益，无需再次激活。'
    : hasVip
      ? membership?.expired_at
        ? `当前权益至 ${formatDateLabel(membership.expired_at)}，如需延长可继续兑换激活码。`
        : '当前权益已开通，可继续使用激活码叠加时长。'
      : settings?.redeem_copy ?? '兑换激活码，尊享全站免费学';
  const vipCardAction = isPermanent ? '已生效' : hasVip ? '继续兑换' : '去兑换';
  const vipCardClassName = `vip-entry-card${hasVip ? ' is-member' : ''}${isPermanent ? ' is-permanent' : ''} tone-${memberTone}`;

  const enabledNotificationCount = Object.values(
    profile?.notification_settings ?? defaultNotificationSettings,
  ).filter(Boolean).length;

  function closeDialog() {
    setActiveDialog(null);
    setDocKeyword('');
    setEmailDraft(profile?.email ?? '');
    setNotificationDraft(profile?.notification_settings ?? defaultNotificationSettings);
  }

  function handleLogout() {
    if (!session?.token) {
      logout();
      return;
    }

    startTransition(async () => {
      try {
        await logoutApp(session.token);
      } catch {
        // no-op
      } finally {
        logout();
        showToast('已退出当前账号');
      }
    });
  }

  async function handleSaveEmail() {
    if (!session?.token) {
      return;
    }

    setAccountSaving(true);

    try {
      const nextProfile = await updateMeEmail(session.token, emailDraft.trim() || null);
      setProfile(nextProfile);
      showToast(nextProfile.email ? '邮箱已保存' : '邮箱已清空');
      closeDialog();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '邮箱保存失败', 'error');
    } finally {
      setAccountSaving(false);
    }
  }

  async function handleSaveNotifications() {
    if (!session?.token) {
      return;
    }

    setNotificationSaving(true);

    try {
      const nextProfile = await updateMeNotificationSettings(session.token, notificationDraft);
      setProfile(nextProfile);
      showToast('通知设置已更新');
      closeDialog();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '通知设置保存失败', 'error');
    } finally {
      setNotificationSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="page-scroll me-page">
        <main className="page-body page-body--me">
          {!mounted ? (
            <div className="skeleton-card" />
          ) : !session ? (
            <EmptyState
              title="登录后查看账号权益"
              description="会员状态、消息提醒、帮助文档和账号设置，都在“我的”页面统一管理。"
              action={
                <Link href="/login" className="primary-button primary-button--inline">
                  去登录
                </Link>
              }
            />
          ) : (
            <>
              <section className="me-hero">
                <div className="me-hero__orb" />
                <div className="profile-hero">
                  <div className="profile-hero__circle">{getInitial(profile?.nickname ?? session.user_info.nickname)}</div>
                  <div className="profile-hero__content">
                    <h1>{profile?.nickname ?? session.user_info.nickname}</h1>
                    <div className="profile-hero__meta">
                      <span>ID: {(profile?.user_id ?? session.user_info.user_id).slice(0, 8)}</span>
                      <strong className={`member-badge${hasVip ? ' is-active' : ''}${isPermanent ? ' is-permanent' : ''} tone-${memberTone}`}>
                        {memberLabel}
                      </strong>
                    </div>
                  </div>
                </div>
                {isPermanent ? (
                  <div className={vipCardClassName}>
                    <div className="vip-entry-card__icon">
                      <CrownIcon className="vip-entry-card__icon-svg" />
                    </div>
                    <div className="vip-entry-card__body">
                      <h3>{vipCardTitle}</h3>
                      <p>{vipCardDescription}</p>
                    </div>
                    <span className="vip-entry-card__action is-static">{vipCardAction}</span>
                  </div>
                ) : (
                  <button type="button" className={vipCardClassName} onClick={openRedeem}>
                    <div className="vip-entry-card__icon">
                      <CrownIcon className="vip-entry-card__icon-svg" />
                    </div>
                    <div className="vip-entry-card__body">
                      <h3>{vipCardTitle}</h3>
                      <p>{vipCardDescription}</p>
                    </div>
                    <span className={`vip-entry-card__action${hasVip ? ' is-secondary' : ''}`}>{vipCardAction}</span>
                  </button>
                )}
              </section>

              <div className="me-page__content">
                <section className="menu-card">
                  <MenuRow
                    icon={<ShieldIcon className="menu-row__svg" />}
                    label="账号与安全"
                    hint={profile?.email ?? '未绑定邮箱'}
                    onClick={() => setActiveDialog('account')}
                  />
                  <MenuRow
                    icon={<BellIcon className="menu-row__svg" />}
                    label="消息通知"
                    hint={
                      profile?.message_count
                        ? `${profile.message_count} 条提醒`
                        : '暂无新提醒'
                    }
                    onClick={() => setActiveDialog('notifications')}
                  />
                  <MenuRow
                    icon={<BookOpenIcon className="menu-row__svg" />}
                    label="在线知识文档"
                    hint={`${knowledgeDocs.length} 篇精选内容`}
                    onClick={() => setActiveDialog('docs')}
                  />
                  <MenuRow
                    icon={<SettingsIcon className="menu-row__svg" />}
                    label="设置"
                    hint={`通知已开启 ${enabledNotificationCount}/4`}
                    onClick={() => setActiveDialog('settings')}
                  />
                </section>

                <button type="button" className="logout-button" onClick={handleLogout} disabled={pending}>
                  <LogoutIcon className="logout-button__icon" />
                  <span>{pending ? '退出中...' : '退出当前账号'}</span>
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      {activeDialog === 'account' && profile ? (
        <div className="modal-backdrop" onClick={closeDialog}>
          <div className="me-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="me-dialog__header">
              <div className="me-dialog__icon me-dialog__icon--security">
                <ShieldIcon className="me-dialog__icon-svg" />
              </div>
              <div className="me-dialog__copy">
                <h3>账号与安全</h3>
              </div>
            </div>

            <div className="me-dialog__body">
              <div className="me-info-grid">
                <div className="me-info-card">
                  <span>登录账号</span>
                  <strong>{profile.login_account || '--'}</strong>
                </div>
                <div className="me-info-card">
                  <span>手机号</span>
                  <strong>{profile.phone || '--'}</strong>
                </div>
                <div className="me-info-card">
                  <span>注册来源</span>
                  <strong>{profile.register_source || '--'}</strong>
                </div>
                <div className="me-info-card">
                  <span>最近登录</span>
                  <strong>{profile.last_login_at ? formatDateLabel(profile.last_login_at) : '--'}</strong>
                </div>
              </div>

              <label className="me-field">
                <span>绑定邮箱</span>
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  placeholder="name@example.com"
                />
                <small>绑定后可接收会员到期、课程更新和系统通知提醒。</small>
              </label>

              <div className="me-dialog__actions">
                <button type="button" className="primary-button" onClick={handleSaveEmail} disabled={accountSaving}>
                  {accountSaving ? '保存中...' : '保存邮箱'}
                </button>
                <button type="button" className="ghost-button" onClick={closeDialog}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeDialog === 'settings' && profile ? (
        <div className="modal-backdrop" onClick={closeDialog}>
          <div className="me-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="me-dialog__header">
              <div className="me-dialog__icon me-dialog__icon--settings">
                <SettingsIcon className="me-dialog__icon-svg" />
              </div>
              <div className="me-dialog__copy">
                <h3>设置</h3>
              </div>
            </div>

            <div className="me-dialog__body">
              <div className="me-info-grid">
                <div className="me-info-card">
                  <span>绑定邮箱</span>
                  <strong>{profile.email || '未绑定'}</strong>
                </div>
                <div className="me-info-card">
                  <span>站内通知状态</span>
                  <strong>{notificationDraft.in_app_system_notice ? '已开启' : '已关闭'}</strong>
                </div>
              </div>

              <div className="notification-list">
                {notificationItems.map((item) => (
                  <label className="notification-card" key={item.key}>
                    <div className="notification-card__copy">
                      <strong>{item.label}</strong>
                      <p>{item.description}</p>
                    </div>
                    <span
                      className={`notification-switch${
                        notificationDraft[item.key] ? ' is-active' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={notificationDraft[item.key]}
                        onChange={(event) =>
                          setNotificationDraft((current) => ({
                            ...current,
                            [item.key]: event.target.checked,
                          }))
                        }
                      />
                      <i />
                    </span>
                  </label>
                ))}
              </div>

              <div className="me-dialog__actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSaveNotifications}
                  disabled={notificationSaving}
                >
                  {notificationSaving ? '保存中...' : '保存设置'}
                </button>
                <button type="button" className="ghost-button" onClick={closeDialog}>
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeDialog === 'notifications' && profile ? (
        <div className="modal-backdrop" onClick={closeDialog}>
          <div className="me-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="me-dialog__header">
              <div className="me-dialog__icon me-dialog__icon--bell">
                <BellIcon className="me-dialog__icon-svg" />
              </div>
              <div className="me-dialog__copy">
                <h3>消息通知</h3>
              </div>
            </div>

            <div className="me-dialog__body">
              <div className="message-feed">
                <div className="message-feed__head">
                  <strong>近期提醒</strong>
                  <span>{profile.message_count} 条</span>
                </div>
                <div className="message-feed__list">
                  {profile.message_list.length > 0 ? (
                    profile.message_list.map((item) => (
                      <article className={`message-item is-${item.tone}`} key={item.message_id}>
                        <div className="message-item__meta">
                          <strong>{item.title}</strong>
                          <span>{item.created_at ? formatDateLabel(item.created_at) : '系统实时生成'}</span>
                        </div>
                        <p>{item.content}</p>
                      </article>
                    ))
                  ) : (
                    <div className="knowledge-empty">当前没有新的站内提醒。</div>
                  )}
                </div>
              </div>

              <div className="me-dialog__actions">
                <button type="button" className="primary-button" onClick={() => setActiveDialog('settings')}>
                  去设置管理提醒
                </button>
                <button type="button" className="ghost-button" onClick={closeDialog}>
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeDialog === 'docs' ? (
        <div className="modal-backdrop" onClick={closeDialog}>
          <div className="me-dialog me-dialog--docs" onClick={(event) => event.stopPropagation()}>
            <div className="me-dialog__header">
              <div className="me-dialog__icon me-dialog__icon--docs">
                <FileTextIcon className="me-dialog__icon-svg" />
              </div>
              <div className="me-dialog__copy">
                <h3>在线知识文档</h3>
              </div>
            </div>

            <div className="me-dialog__body">
              <label className="me-field">
                <span>搜索文档</span>
                <input
                  value={docKeyword}
                  onChange={(event) => setDocKeyword(event.target.value)}
                  placeholder="搜索关键词，例如：邮箱、会员、播放"
                />
              </label>

              <div className="knowledge-list">
                {filteredDocs.map((item) => (
                  <article className="knowledge-card" key={item.id}>
                    <div className="knowledge-card__meta">
                      <span>{item.category}</span>
                      <strong>{item.title}</strong>
                    </div>
                    <p>{item.content}</p>
                  </article>
                ))}
              </div>

              {filteredDocs.length === 0 ? (
                <div className="knowledge-empty">没有匹配的知识文档，换个关键词试试。</div>
              ) : null}

              <div className="me-dialog__actions">
                <button type="button" className="ghost-button" onClick={closeDialog}>
                  关闭文档
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
