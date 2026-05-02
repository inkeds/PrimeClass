'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import {
  ActionIconButton,
  Badge,
  Banner,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
  Tabs,
} from '@/components/admin/AdminUI';
import { apiRequest, type ListPayload } from '@/components/admin/lib/api';
import { formatDateTime, formatNumber } from '@/components/admin/lib/format';
import { getErrorMessage } from '@/components/admin/shared';

type MembershipTab = 'packages' | 'batches' | 'codes' | 'logs';

type MembershipPackage = {
  package_id: string;
  package_code: string;
  package_name: string;
  package_type: string;
  package_tone: 'blue' | 'green' | 'gold' | 'red' | 'slate' | 'violet';
  duration_days: number | null;
  is_permanent: boolean;
  rights_desc: string | null;
  status: string;
  sort_order: number;
};

type ActivationBatch = {
  batch_id: string;
  batch_no: string;
  package_id: string;
  package_name: string;
  quantity: number;
  used_count: number;
  unused_count: number;
  status: string;
  expired_at: string | null;
  source_channel: string | null;
  remark: string | null;
  created_admin_name: string | null;
  created_at: string;
};

type ActivationCode = {
  code_id: string;
  batch_no: string;
  code: string;
  package_name: string;
  status: string;
  expired_at: string | null;
  used_by_user_nickname: string | null;
  used_at: string | null;
  invalid_reason: string | null;
};

type RedeemLog = {
  log_id: string;
  user_nickname: string | null;
  phone: string | null;
  batch_no: string | null;
  code_snapshot: string;
  package_name: string | null;
  result_status: string;
  failure_reason: string | null;
  current_expired_at: string | null;
  created_at: string;
};

const packageToneOptions = [
  { value: 'gold', label: '金色' },
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' },
  { value: 'violet', label: '紫色' },
  { value: 'red', label: '红色' },
  { value: 'slate', label: '灰色' },
] as const;

function getPackageTypeLabel(packageType: string) {
  switch (packageType) {
    case 'day_card':
      return '日卡';
    case 'term_card':
      return '学期卡';
    case 'year_card':
      return '年卡';
    case 'permanent':
      return '永久卡';
    default:
      return packageType;
  }
}

function getBatchStatusLabel(status: string) {
  if (status === 'enabled') {
    return '进行中';
  }

  if (status === 'disabled') {
    return '已停用';
  }

  return status;
}

function getCodeStatusLabel(status: string) {
  if (status === 'used') {
    return '已使用';
  }

  if (status === 'unused') {
    return '未使用';
  }

  if (status === 'invalid') {
    return '已作废';
  }

  return status;
}

function getPackageToneLabel(packageTone: MembershipPackage['package_tone']) {
  return packageToneOptions.find((item) => item.value === packageTone)?.label ?? packageTone;
}

export function MembershipPage() {
  const [tab, setTab] = useState<MembershipTab>('packages');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [packages, setPackages] = useState<MembershipPackage[]>([]);
  const [batches, setBatches] = useState<ActivationBatch[]>([]);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [logs, setLogs] = useState<RedeemLog[]>([]);
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [packageForm, setPackageForm] = useState<{
    package_id?: string;
    package_name: string;
    package_type: string;
    package_tone: MembershipPackage['package_tone'];
    duration_days: string;
    is_permanent: boolean;
    rights_desc: string;
    status: string;
    sort_order: string;
  }>({
    package_name: '',
    package_type: 'day_card',
    package_tone: 'blue',
    duration_days: '30',
    is_permanent: false,
    rights_desc: '',
    status: 'enabled',
    sort_order: '0',
  });
  const [batchForm, setBatchForm] = useState({
    package_id: '',
    quantity: '100',
    expired_at: '',
    source_channel: '',
    remark: '',
  });

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setError('');

    try {
      await Promise.all([loadPackages(), loadBatches(), loadCodes(), loadLogs()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadPackages() {
    const data = await apiRequest<ListPayload<MembershipPackage>>('/membership/packages?page=1&page_size=100');
    setPackages(data.list);
  }

  async function loadBatches() {
    const data = await apiRequest<ListPayload<ActivationBatch>>('/membership/code-batches?page=1&page_size=50');
    setBatches(data.list);
  }

  async function loadCodes() {
    const data = await apiRequest<ListPayload<ActivationCode>>('/membership/codes?page=1&page_size=50');
    setCodes(data.list);
  }

  async function loadLogs() {
    const data = await apiRequest<ListPayload<RedeemLog>>('/membership/redeem-logs?page=1&page_size=50');
    setLogs(data.list);
  }

  function openPackageModal(item?: MembershipPackage) {
    setPackageForm(
      item
        ? {
            package_id: item.package_id,
            package_name: item.package_name,
            package_type: item.package_type,
            package_tone: item.package_tone,
            duration_days: item.duration_days ? String(item.duration_days) : '',
            is_permanent: item.is_permanent,
            rights_desc: item.rights_desc || '',
            status: item.status,
            sort_order: String(item.sort_order),
          }
        : {
            package_name: '',
            package_type: 'day_card',
            package_tone: 'blue',
            duration_days: '30',
            is_permanent: false,
            rights_desc: '',
            status: 'enabled',
            sort_order: '0',
          },
    );
    setPackageModalOpen(true);
  }

  async function savePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const payload = {
      package_name: packageForm.package_name,
      package_type: packageForm.package_type,
      package_tone: packageForm.package_tone,
      duration_days: packageForm.is_permanent ? null : Number(packageForm.duration_days || 0),
      is_permanent: packageForm.is_permanent,
      rights_desc: packageForm.rights_desc || null,
      status: packageForm.status,
      sort_order: Number(packageForm.sort_order || 0),
    };

    try {
      if (packageForm.package_id) {
        await apiRequest(`/membership/packages/${packageForm.package_id}`, {
          method: 'POST',
          body: payload,
        });
      } else {
        await apiRequest('/membership/packages', { method: 'POST', body: payload });
      }

      setPackageModalOpen(false);
      await loadPackages();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      await apiRequest('/membership/code-batches', {
        method: 'POST',
        body: {
          package_id: batchForm.package_id,
          quantity: Number(batchForm.quantity || 0),
          expired_at: batchForm.expired_at || null,
          source_channel: batchForm.source_channel || null,
          remark: batchForm.remark || null,
        },
      });

      setBatchModalOpen(false);
      setBatchForm({
        package_id: '',
        quantity: '100',
        expired_at: '',
        source_channel: '',
        remark: '',
      });
      await Promise.all([loadBatches(), loadCodes()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function invalidateCode(codeId: string) {
    const reason = window.prompt('请输入作废原因', '运营手动作废');

    if (!reason) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/membership/codes/${codeId}/invalidate`, {
        method: 'POST',
        body: {
          reason,
        },
      });

      await loadCodes();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const enabledPackages = packages.filter((item) => item.status === 'enabled').length;
  const activeBatchCount = batches.filter((item) => item.status === 'enabled').length;
  const unusedCodeCount = codes.filter((item) => item.status === 'unused').length;
  const successLogCount = logs.filter((item) => item.result_status === 'success').length;

  return (
    <div className="page-stack">
      <PageHeader
        title="会员管理"
        description="管理会员套餐、激活码批次、激活码状态和兑换记录。"
        actions={
          tab === 'packages' ? (
            <button className="button button-primary" onClick={() => openPackageModal()} type="button">
              新增套餐
            </button>
          ) : tab === 'batches' ? (
            <button className="button button-primary" onClick={() => setBatchModalOpen(true)} type="button">
              生成批次
            </button>
          ) : (
            <button className="button button-secondary" onClick={() => void bootstrap()} type="button">
              刷新数据
            </button>
          )
        }
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <section className="summary-strip">
        <article className="summary-card summary-card-gold">
          <div>
            <span>会员套餐</span>
            <strong>{formatNumber(enabledPackages)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
        <article className="summary-card summary-card-blue">
          <div>
            <span>激活码批次</span>
            <strong>{formatNumber(activeBatchCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
        <article className="summary-card summary-card-green">
          <div>
            <span>未使用激活码</span>
            <strong>{formatNumber(unusedCodeCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
        <article className="summary-card summary-card-violet">
          <div>
            <span>成功兑换记录</span>
            <strong>{formatNumber(successLogCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
      </section>

      <Tabs
        items={[
          { value: 'packages', label: '会员套餐' },
          { value: 'batches', label: '激活码批次' },
          { value: 'codes', label: '激活码列表' },
          { value: 'logs', label: '兑换记录' },
        ]}
        value={tab}
        onChange={setTab}
        variant="button"
      />

      {loading ? <LoadingBlock text="正在加载会员数据…" /> : null}

      {!loading && tab === 'packages' ? (
        <Panel title="会员套餐" subtitle={`当前共 ${formatNumber(packages.length)} 项`}>
          {packages.length === 0 ? (
            <EmptyState title="暂无会员套餐" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>套餐</th>
                    <th>类型</th>
                    <th>主色</th>
                    <th>时长</th>
                    <th>状态</th>
                    <th>排序</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((item) => (
                    <tr key={item.package_id}>
                      <td>
                        <div className="person-cell">
                          <span className={`package-chip tone-${item.package_tone}`}>V</span>
                          <div>
                            <div className="table-title">{item.package_name}</div>
                            <div className="table-subtitle">{item.package_code}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={item.package_type === 'permanent' ? 'gold' : 'blue'}>
                          {getPackageTypeLabel(item.package_type)}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={item.package_tone}>{getPackageToneLabel(item.package_tone)}</Badge>
                      </td>
                      <td>{item.is_permanent ? '永久' : `${item.duration_days || 0} 天`}</td>
                      <td>
                        <Badge tone={item.status === 'enabled' ? 'green' : 'slate'}>
                          {item.status === 'enabled' ? '已启用' : '已停用'}
                        </Badge>
                      </td>
                      <td>{item.sort_order}</td>
                      <td>
                        <div className="table-actions">
                          <ActionIconButton icon="edit" label="编辑套餐" onClick={() => openPackageModal(item)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {!loading && tab === 'batches' ? (
        <Panel title="激活码批次" subtitle={`当前共 ${formatNumber(batches.length)} 个批次`}>
          {batches.length === 0 ? (
            <EmptyState title="暂无激活码批次" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>批次</th>
                    <th>套餐</th>
                    <th>数量</th>
                    <th>状态</th>
                    <th>到期时间</th>
                    <th>渠道</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((item) => (
                    <tr key={item.batch_id}>
                      <td>
                        <div className="table-title">{item.batch_no}</div>
                        <div className="table-subtitle">{item.created_admin_name || '--'}</div>
                      </td>
                      <td>{item.package_name}</td>
                      <td>
                        <div className="metric-stack">
                          <strong>已用 {formatNumber(item.used_count)}</strong>
                          <span>未用 {formatNumber(item.unused_count)}</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={item.status === 'enabled' ? 'green' : 'slate'}>
                          {getBatchStatusLabel(item.status)}
                        </Badge>
                      </td>
                      <td>{formatDateTime(item.expired_at)}</td>
                      <td>{item.source_channel || '--'}</td>
                      <td>{formatDateTime(item.created_at).slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {!loading && tab === 'codes' ? (
        <Panel title="激活码列表" subtitle={`当前共 ${formatNumber(codes.length)} 个激活码`}>
          {codes.length === 0 ? (
            <EmptyState title="暂无激活码" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>激活码</th>
                    <th>批次</th>
                    <th>套餐</th>
                    <th>状态</th>
                    <th>使用人</th>
                    <th>使用时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((item) => (
                    <tr key={item.code_id}>
                      <td>
                        <div className="table-title">{item.code}</div>
                        <div className="table-subtitle">{item.invalid_reason || '正常'}</div>
                      </td>
                      <td>{item.batch_no}</td>
                      <td>{item.package_name}</td>
                      <td>
                        <Badge
                          tone={
                            item.status === 'used'
                              ? 'blue'
                              : item.status === 'unused'
                                ? 'green'
                              : 'red'
                          }
                        >
                          {getCodeStatusLabel(item.status)}
                        </Badge>
                      </td>
                      <td>{item.used_by_user_nickname || '--'}</td>
                      <td>{formatDateTime(item.used_at)}</td>
                      <td>
                        {item.status === 'unused' ? (
                          <div className="table-actions">
                            <ActionIconButton
                              disabled={submitting}
                              icon="delete"
                              label="作废激活码"
                              onClick={() => void invalidateCode(item.code_id)}
                              tone="danger"
                            />
                          </div>
                        ) : (
                          '--'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {!loading && tab === 'logs' ? (
        <Panel title="兑换记录" subtitle={`当前共 ${formatNumber(logs.length)} 条记录`}>
          {logs.length === 0 ? (
            <EmptyState title="暂无兑换记录" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>激活码</th>
                    <th>套餐</th>
                    <th>结果</th>
                    <th>当前到期</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((item) => (
                    <tr key={item.log_id}>
                      <td>
                        <div className="person-cell">
                          <span className="person-avatar person-avatar-0">{(item.user_nickname || '匿').slice(0, 1)}</span>
                          <div>
                            <div className="table-title">{item.user_nickname || '--'}</div>
                            <div className="table-subtitle">{item.phone || '--'}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="table-title">{item.code_snapshot}</div>
                        <div className="table-subtitle">{item.batch_no || '--'}</div>
                      </td>
                      <td>{item.package_name || '--'}</td>
                      <td>
                        <Badge tone={item.result_status === 'success' ? 'green' : 'red'}>
                          {item.result_status === 'success' ? '成功' : '失败'}
                        </Badge>
                      </td>
                      <td>{formatDateTime(item.current_expired_at)}</td>
                      <td>{formatDateTime(item.created_at).slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      <Modal open={packageModalOpen} title={packageForm.package_id ? '编辑套餐' : '新增套餐'} onClose={() => setPackageModalOpen(false)}>
        <form className="page-stack" onSubmit={savePackage}>
          <div className="dialog-section-title">
            <strong>套餐基础信息</strong>
            <span>配置套餐类型、时长与权益说明</span>
          </div>

          <label className="field">
            <span>套餐名称</span>
            <input
              required
              value={packageForm.package_name}
              onChange={(event) => setPackageForm((current) => ({ ...current, package_name: event.target.value }))}
            />
          </label>
          <div className="form-columns">
            <label className="field">
              <span>套餐类型</span>
              <select
                value={packageForm.package_type}
                onChange={(event) => setPackageForm((current) => ({ ...current, package_type: event.target.value }))}
              >
                <option value="day_card">日卡</option>
                <option value="term_card">学期卡</option>
                <option value="year_card">年卡</option>
                <option value="permanent">永久卡</option>
              </select>
            </label>
            <label className="field">
              <span>状态</span>
              <select
                value={packageForm.status}
                onChange={(event) => setPackageForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="enabled">已启用</option>
                <option value="disabled">已停用</option>
              </select>
            </label>
            <label className="field">
              <span>会员色系</span>
              <select
                value={packageForm.package_tone}
                onChange={(event) =>
                  setPackageForm((current) => ({
                    ...current,
                    package_tone: event.target.value as MembershipPackage['package_tone'],
                  }))
                }
              >
                {packageToneOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-columns">
            <label className="checkbox-item checkbox-item-inline">
              <input
                checked={packageForm.is_permanent}
                onChange={(event) => setPackageForm((current) => ({ ...current, is_permanent: event.target.checked }))}
                type="checkbox"
              />
              <span>永久会员</span>
            </label>
            <label className="field">
              <span>时长（天）</span>
              <input
                disabled={packageForm.is_permanent}
                type="number"
                value={packageForm.duration_days}
                onChange={(event) => setPackageForm((current) => ({ ...current, duration_days: event.target.value }))}
              />
            </label>
          </div>
          <label className="field">
            <span>权益说明</span>
            <textarea
              rows={4}
              value={packageForm.rights_desc}
              onChange={(event) => setPackageForm((current) => ({ ...current, rights_desc: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>排序</span>
            <input
              type="number"
              value={packageForm.sort_order}
              onChange={(event) => setPackageForm((current) => ({ ...current, sort_order: event.target.value }))}
            />
          </label>
          <div className="button-row">
            <button className="button button-primary" disabled={submitting} type="submit">
              保存套餐
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={batchModalOpen} title="生成激活码批次" onClose={() => setBatchModalOpen(false)}>
        <form className="page-stack" onSubmit={createBatch}>
          <div className="dialog-section-title">
            <strong>批次参数</strong>
            <span>创建激活码批次后即可进入列表发放或作废</span>
          </div>

          <label className="field">
            <span>会员套餐</span>
            <select
              required
              value={batchForm.package_id}
              onChange={(event) => setBatchForm((current) => ({ ...current, package_id: event.target.value }))}
            >
              <option value="">请选择套餐</option>
              {packages
                .filter((item) => item.status === 'enabled')
                .map((item) => (
                  <option key={item.package_id} value={item.package_id}>
                    {item.package_name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>数量</span>
            <input
              required
              type="number"
              value={batchForm.quantity}
              onChange={(event) => setBatchForm((current) => ({ ...current, quantity: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>到期时间</span>
            <input
              type="datetime-local"
              value={batchForm.expired_at}
              onChange={(event) => setBatchForm((current) => ({ ...current, expired_at: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>来源渠道</span>
            <input
              value={batchForm.source_channel}
              onChange={(event) => setBatchForm((current) => ({ ...current, source_channel: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>备注</span>
            <textarea
              rows={3}
              value={batchForm.remark}
              onChange={(event) => setBatchForm((current) => ({ ...current, remark: event.target.value }))}
            />
          </label>
          <div className="button-row">
            <button className="button button-primary" disabled={submitting} type="submit">
              创建批次
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
