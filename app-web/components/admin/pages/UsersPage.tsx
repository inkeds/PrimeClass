'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { ActionIconButton, Badge, Banner, EmptyState, LoadingBlock, Modal, PageHeader, Panel } from '@/components/admin/AdminUI';
import { apiRequest, toQueryString, type ListPayload } from '@/components/admin/lib/api';
import { formatDateTime, formatNumber } from '@/components/admin/lib/format';
import { getErrorMessage } from '@/components/admin/shared';

type UserListItem = {
  user_id: string;
  user_no: string;
  login_account: string | null;
  phone: string | null;
  nickname: string;
  register_source: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  membership_status: string;
  membership_expired_at: string | null;
  membership_is_permanent: boolean;
  last_active_at: string | null;
};

type UserDetail = {
  user: {
    user_id: string;
    user_no: string;
    nickname: string;
    login_account: string | null;
    phone: string | null;
    status: string;
    register_source: string;
    last_login_at: string | null;
    last_login_ip: string | null;
    created_at: string;
  };
  profile: {
    gender: string | null;
    grade_code: string | null;
    version_code: string | null;
    province: string | null;
    city: string | null;
    school_name: string | null;
  } | null;
  membership: {
    package_name: string | null;
    membership_status: string;
    expired_at: string | null;
    is_permanent: boolean;
    source_type: string | null;
  } | null;
  remarks: Array<{
    remark_id: string;
    content: string;
    created_at: string;
    admin_name: string | null;
  }>;
};

type LearningRecord = {
  record_id: string;
  course_title: string | null;
  lesson_title: string | null;
  progress_percent: number;
  watched_seconds: number;
  is_completed: boolean;
  last_learned_at: string | null;
};

function getMembershipStatusLabel(status: string, isPermanent?: boolean) {
  if (isPermanent || status === 'permanent') {
    return '永久会员';
  }

  if (status === 'active') {
    return 'VIP';
  }

  if (status === 'expired') {
    return '已过期';
  }

  return '普通';
}

function getAccountStatusLabel(status: string) {
  return status === 'disabled' ? '已冻结' : '正常';
}

export function UsersPage() {
  const [keyword, setKeyword] = useState('');
  const [membershipStatus, setMembershipStatus] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [list, setList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [learningRecords, setLearningRecords] = useState<LearningRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError('');

    try {
      const data = await apiRequest<ListPayload<UserListItem>>(
        `/users${toQueryString({
          keyword,
          membership_status: membershipStatus,
          account_status: accountStatus,
          page: 1,
          page_size: 20,
        })}`,
      );
      setList(data.list);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function openUser(userId: string) {
    setDetailLoading(true);
    setSelectedUser(null);
    setLearningRecords([]);

    try {
      const [detail, records] = await Promise.all([
        apiRequest<UserDetail>(`/users/${userId}`),
        apiRequest<ListPayload<LearningRecord>>(`/users/${userId}/learning-records?page=1&page_size=20`),
      ]);

      setSelectedUser(detail);
      setLearningRecords(records.list);
      setRemarkDraft('');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateUserStatus(userId: string, nextStatus: 'normal' | 'disabled') {
    setSubmitting(true);

    try {
      await apiRequest(`/users/${userId}/status`, {
        method: 'POST',
        body: {
          status: nextStatus,
          reason: nextStatus === 'disabled' ? '后台人工冻结' : '后台人工解冻',
        },
      });

      await loadUsers();

      if (selectedUser?.user.user_id === userId) {
        await openUser(userId);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRemark(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUser || !remarkDraft.trim()) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/users/${selectedUser.user.user_id}/remarks`, {
        method: 'POST',
        body: {
          content: remarkDraft.trim(),
        },
      });

      await openUser(selectedUser.user.user_id);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function exportUserArchive() {
    const rows = [
      ['昵称', '用户编号', '登录标识', '会员状态', '账号状态', '最近活跃', '注册时间'],
      ...list.map((user) => [
        user.nickname,
        user.user_no,
        user.phone || user.login_account || '--',
        user.membership_status,
        user.status,
        formatDateTime(user.last_active_at),
        formatDateTime(user.created_at),
      ]),
    ];

    const content = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')}`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `user-archive-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const newRegisteredCount = list.filter((user) => user.created_at.startsWith(todayKey)).length;
  const vipCount = list.filter((user) => ['active', 'permanent'].includes(user.membership_status)).length;
  const activeCount = list.filter((user) => Boolean(user.last_active_at)).length;

  function resetFilters() {
    setKeyword('');
    setMembershipStatus('');
    setAccountStatus('');
    window.setTimeout(() => {
      void loadUsers();
    }, 0);
  }

  return (
    <div className="page-stack">
      <PageHeader title="学员档案库" description="查询账号状态、会员信息、学习记录，并支持冻结或客服备注。" />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <section className="summary-strip summary-strip-3">
        <article className="summary-card summary-card-blue">
          <div>
            <span>新注册学员</span>
            <strong>{formatNumber(newRegisteredCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>

        <article className="summary-card summary-card-gold">
          <div>
            <span>活跃 VIP</span>
            <strong>{formatNumber(vipCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>

        <article className="summary-card summary-card-green">
          <div>
            <span>近期活跃学员</span>
            <strong>{formatNumber(activeCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
      </section>

      <Panel
        title="学员列表"
        subtitle={`当前共展示 ${list.length} 条记录`}
        actions={
          <button className="button button-secondary" onClick={exportUserArchive} type="button">
            导出学员档案
          </button>
        }
      >
        <form
          className="list-toolbar list-toolbar-stable"
          onSubmit={(event) => {
            event.preventDefault();
            void loadUsers();
          }}
        >
          <div className="list-toolbar-main">
            <label className="field field-compact">
              <input
                placeholder="手机号/姓名/UID"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <label className="field field-compact">
              <select value={membershipStatus} onChange={(event) => setMembershipStatus(event.target.value)}>
                <option value="">全部会员</option>
                <option value="normal">普通</option>
                <option value="active">VIP</option>
                <option value="permanent">永久</option>
                <option value="expired">过期</option>
              </select>
            </label>
            <label className="field field-compact">
              <select value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}>
                <option value="">全部状态</option>
                <option value="normal">正常</option>
                <option value="disabled">冻结</option>
              </select>
            </label>
          </div>
          <div className="list-toolbar-actions">
            <button className="button button-primary" type="submit">
              查询
            </button>
            <button
              className="button button-ghost"
              onClick={resetFilters}
              type="button"
            >
              重置
            </button>
          </div>
        </form>

        {loading ? (
          <LoadingBlock text="正在加载用户列表…" />
        ) : list.length === 0 ? (
          <EmptyState title="没有匹配的用户" description="换个筛选条件再试。" />
        ) : (
          <div className="table-wrap table-wrap-wide">
            <table className="data-table data-table-users">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>登录标识</th>
                  <th>会员状态</th>
                  <th>账号状态</th>
                  <th>最近活跃</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((user, index) => (
                  <tr key={user.user_id}>
                    <td>
                      <div className="person-cell">
                        <span className={`person-avatar person-avatar-${index % 4}`}>{user.nickname.slice(0, 1)}</span>
                        <div>
                          <div className="table-title-row">
                            <div className="table-title">{user.nickname}</div>
                            {(user.membership_status === 'active' || user.membership_status === 'permanent') ? (
                              <span className="inline-vip-badge">VIP</span>
                            ) : null}
                          </div>
                          <div className="table-subtitle">
                            ID: {user.user_no}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{user.phone || user.login_account || '--'}</td>
                    <td>
                      <Badge
                        tone={
                          user.membership_status === 'permanent'
                            ? 'gold'
                            : user.membership_status === 'active'
                              ? 'green'
                              : 'slate'
                        }
                      >
                        {getMembershipStatusLabel(user.membership_status, user.membership_is_permanent)}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={user.status === 'normal' ? 'blue' : 'red'}>
                        {getAccountStatusLabel(user.status)}
                      </Badge>
                    </td>
                    <td className="table-cell-nowrap">{formatDateTime(user.last_active_at)}</td>
                    <td className="table-cell-nowrap">{formatDateTime(user.created_at)}</td>
                    <td>
                      <div className="table-actions">
                        <ActionIconButton
                          icon="view"
                          label="查看详情"
                          onClick={() => void openUser(user.user_id)}
                        />
                        <ActionIconButton
                          disabled={submitting}
                          icon="lock"
                          label={user.status === 'normal' ? '冻结账号' : '恢复账号'}
                          onClick={() =>
                            void updateUserStatus(
                              user.user_id,
                              user.status === 'normal' ? 'disabled' : 'normal',
                            )
                          }
                          tone={user.status === 'normal' ? 'danger' : 'soft'}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={detailLoading || Boolean(selectedUser)}
        title={selectedUser ? `用户详情 · ${selectedUser.user.nickname}` : '加载中'}
        onClose={() => setSelectedUser(null)}
        width="large"
      >
        {detailLoading || !selectedUser ? (
          <LoadingBlock text="正在加载用户详情…" />
        ) : (
          <div className="page-stack">
            <section className="dialog-profile-head">
              <div className="dialog-profile-main">
                <span className="dialog-profile-avatar">{selectedUser.user.nickname.slice(0, 1)}</span>
                <div>
                  <strong>{selectedUser.user.nickname}</strong>
                  <span>{selectedUser.user.login_account || selectedUser.user.phone || selectedUser.user.user_no}</span>
                </div>
              </div>
              <div className="dialog-profile-badges">
                <Badge tone={selectedUser.user.status === 'normal' ? 'green' : 'red'}>
                  {selectedUser.user.status === 'normal' ? '账号正常' : '账号冻结'}
                </Badge>
                <Badge
                  tone={
                    selectedUser.membership?.membership_status === 'permanent'
                      ? 'gold'
                      : selectedUser.membership?.membership_status === 'active'
                        ? 'blue'
                        : 'slate'
                  }
                >
                  {selectedUser.membership?.package_name ||
                    getMembershipStatusLabel(
                      selectedUser.membership?.membership_status || 'normal',
                      selectedUser.membership?.is_permanent,
                    )}
                </Badge>
              </div>
            </section>

            <div className="detail-grid">
              <div className="detail-card">
                <span>账号</span>
                <strong>{selectedUser.user.login_account || selectedUser.user.phone || '--'}</strong>
              </div>
              <div className="detail-card">
                <span>会员</span>
                <strong>
                  {selectedUser.membership?.package_name ||
                    getMembershipStatusLabel(
                      selectedUser.membership?.membership_status || 'normal',
                      selectedUser.membership?.is_permanent,
                    )}
                </strong>
              </div>
              <div className="detail-card">
                <span>最近登录</span>
                <strong>{formatDateTime(selectedUser.user.last_login_at)}</strong>
              </div>
            </div>

            <div className="split-grid">
              <Panel title="基本信息">
                <dl className="detail-list">
                  <div>
                    <dt>用户编号</dt>
                    <dd>{selectedUser.user.user_no}</dd>
                  </div>
                  <div>
                    <dt>注册来源</dt>
                    <dd>{selectedUser.user.register_source}</dd>
                  </div>
                  <div>
                    <dt>年级</dt>
                    <dd>{selectedUser.profile?.grade_code || '--'}</dd>
                  </div>
                  <div>
                    <dt>版本</dt>
                    <dd>{selectedUser.profile?.version_code || '--'}</dd>
                  </div>
                  <div>
                    <dt>学校</dt>
                    <dd>{selectedUser.profile?.school_name || '--'}</dd>
                  </div>
                  <div>
                    <dt>登录 IP</dt>
                    <dd>{selectedUser.user.last_login_ip || '--'}</dd>
                  </div>
                </dl>
              </Panel>

              <Panel
                title="状态操作"
                actions={
                  <button
                    className="button button-primary button-small"
                    disabled={submitting}
                    onClick={() =>
                      void updateUserStatus(
                        selectedUser.user.user_id,
                        selectedUser.user.status === 'normal' ? 'disabled' : 'normal',
                      )
                    }
                    type="button"
                  >
                    {selectedUser.user.status === 'normal' ? '冻结账号' : '恢复账号'}
                  </button>
                }
              >
                <div className="note-list">
                  <div className="note-item">
                    <strong>当前状态</strong>
                    <p>{selectedUser.user.status}</p>
                  </div>
                  <div className="note-item">
                    <strong>会员到期</strong>
                    <p>{selectedUser.membership?.is_permanent ? '永久会员' : formatDateTime(selectedUser.membership?.expired_at)}</p>
                  </div>
                </div>
              </Panel>
            </div>

            <Panel title="学习记录">
              {learningRecords.length === 0 ? (
                <EmptyState title="暂无学习记录" />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>课程</th>
                        <th>课时</th>
                        <th>进度</th>
                        <th>学习时长</th>
                        <th>最近学习</th>
                      </tr>
                    </thead>
                    <tbody>
                      {learningRecords.map((record) => (
                        <tr key={record.record_id}>
                          <td>{record.course_title || '--'}</td>
                          <td>{record.lesson_title || '--'}</td>
                          <td>{record.progress_percent}%</td>
                          <td>{record.watched_seconds}s</td>
                          <td>{formatDateTime(record.last_learned_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="客服备注">
              <form className="page-stack" onSubmit={submitRemark}>
                <label className="field">
                  <span>新增备注</span>
                  <textarea
                    rows={4}
                    value={remarkDraft}
                    onChange={(event) => setRemarkDraft(event.target.value)}
                  />
                </label>
                <div className="button-row">
                  <button className="button button-primary" disabled={submitting} type="submit">
                    保存备注
                  </button>
                </div>
              </form>

              <div className="timeline">
                {selectedUser.remarks.map((remark) => (
                  <div className="timeline-item" key={remark.remark_id}>
                    <strong>{remark.admin_name || '管理员'}</strong>
                    <p>{remark.content}</p>
                    <span>{formatDateTime(remark.created_at)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </Modal>
    </div>
  );
}
