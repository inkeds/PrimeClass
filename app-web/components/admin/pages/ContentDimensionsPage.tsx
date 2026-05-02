'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

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
import { apiRequest } from '@/components/admin/lib/api';
import {
  CONTENT_DIMENSION_LABELS,
  CONTENT_DIMENSION_TYPES,
  type ContentDimensionItem,
  type ContentDimensionsPayload,
  type ContentDimensionType,
} from '@/components/admin/lib/content-dimensions';
import { formatDateTime, formatNumber } from '@/components/admin/lib/format';
import { getErrorMessage } from '@/components/admin/shared';

type DimensionFormState = {
  id?: string;
  type: ContentDimensionType;
  item_code: string;
  item_name: string;
  sort_order: string;
  status: string;
  is_default: boolean;
  home_visible: boolean;
  version_codes: string[];
  grade_codes: string[];
  subject_codes: string[];
};

const emptyDimensions: ContentDimensionsPayload = {
  dimension_types: CONTENT_DIMENSION_TYPES.map((type) => ({
    type,
    label: CONTENT_DIMENSION_LABELS[type],
    description: '',
  })),
  dimensions: {
    version: [],
    subject: [],
    grade: [],
    term: [],
  },
};

function createEmptyForm(type: ContentDimensionType): DimensionFormState {
  return {
    type,
    item_code: '',
    item_name: '',
    sort_order: '0',
    status: 'enabled',
    is_default: false,
    home_visible: true,
    version_codes: [],
    grade_codes: [],
    subject_codes: [],
  };
}

const CONTENT_DIMENSION_GUIDES: Record<
  ContentDimensionType,
  {
    eyebrow: string;
    title: string;
    points: string[];
    effect: string;
  }
> = {
  version: {
    eyebrow: '一级主控',
    title: '教材版本决定整站内容范围',
    points: ['控制前台左上角版本切换', '可指定默认版本并绑定学科、年级'],
    effect: '会直接影响前台默认进入的内容范围',
  },
  subject: {
    eyebrow: '二级导航',
    title: '学科决定首页导航入口',
    points: ['决定首页学科是否显示', '可限制在指定教材版本下出现'],
    effect: '会直接影响首页学科导航和同步课入口',
  },
  grade: {
    eyebrow: '三级筛选',
    title: '年级负责课程层级区分',
    points: ['用于课程筛选和内容归类', '可按教材版本做适配范围控制'],
    effect: '主要影响课程筛选，不单独充当前台导航入口',
  },
  term: {
    eyebrow: '末级筛选',
    title: '学期只做更细的内容区分',
    points: ['绑定年级使用', '用于上下学期和阶段区分'],
    effect: '只作为课程筛选补充维度，不承担站点主结构职责',
  },
};

export function ContentDimensionsPage() {
  const [dimensions, setDimensions] = useState<ContentDimensionsPayload>(emptyDimensions);
  const [tab, setTab] = useState<ContentDimensionType>('version');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<DimensionFormState>(createEmptyForm('version'));

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setError('');

    try {
      const data = await apiRequest<ContentDimensionsPayload>('/content-dimensions');
      setDimensions(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setForm(createEmptyForm(tab));
    setModalOpen(true);
  }

  function openEditModal(item: ContentDimensionItem) {
    setForm({
      id: item.id,
      type: item.type,
      item_code: item.item_code,
      item_name: item.item_name,
      sort_order: String(item.sort_order),
      status: item.status,
      is_default: item.flags.is_default,
      home_visible: item.flags.home_visible,
      version_codes: item.relations.version.map((entry) => entry.item_code),
      grade_codes: item.relations.grade.map((entry) => entry.item_code),
      subject_codes: item.relations.subject.map((entry) => entry.item_code),
    });
    setModalOpen(true);
  }

  async function saveDimension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      type: form.type,
      item_code: form.item_code.trim(),
      item_name: form.item_name.trim(),
      sort_order: Number(form.sort_order || 0),
      status: form.status,
      is_default: form.is_default,
      home_visible: form.home_visible,
      version_codes: form.version_codes,
      grade_codes: form.grade_codes,
      subject_codes: form.subject_codes,
    };

    try {
      if (form.id) {
        await apiRequest(`/content-dimensions/${form.id}`, { method: 'POST', body: payload });
      } else {
        await apiRequest('/content-dimensions', { method: 'POST', body: payload });
      }

      setModalOpen(false);
      await bootstrap();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeDimension(item: ContentDimensionItem) {
    if (!window.confirm(`确认删除${item.item_name}吗？`)) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await apiRequest(`/content-dimensions/${item.id}/delete`, { method: 'POST' });
      await bootstrap();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSelection(field: 'version_codes' | 'grade_codes' | 'subject_codes', code: string, checked: boolean) {
    setForm((current) => {
      const currentValues = current[field];

      return {
        ...current,
        [field]: checked ? [...currentValues, code] : currentValues.filter((item) => item !== code),
      };
    });
  }

  const metaMap = useMemo(
    () =>
      new Map(
        dimensions.dimension_types.map((item) => [item.type, item] as const),
      ),
    [dimensions.dimension_types],
  );
  const currentItems = dimensions.dimensions[tab] ?? [];
  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return currentItems.filter((item) => {
      if (!normalizedKeyword) {
        return true;
      }

      return [item.item_name, item.item_code].some((value) => value.toLowerCase().includes(normalizedKeyword));
    });
  }, [currentItems, keyword]);
  const totalCount = useMemo(
    () => CONTENT_DIMENSION_TYPES.reduce((count, type) => count + dimensions.dimensions[type].length, 0),
    [dimensions],
  );
  const enabledCount = useMemo(
    () =>
      CONTENT_DIMENSION_TYPES.reduce(
        (count, type) => count + dimensions.dimensions[type].filter((item) => item.status === 'enabled').length,
        0,
      ),
    [dimensions],
  );

  const versionOptions = dimensions.dimensions.version;
  const subjectOptions = dimensions.dimensions.subject;
  const gradeOptions = dimensions.dimensions.grade;
  const currentMeta = metaMap.get(tab);
  const currentFormMeta = metaMap.get(form.type);
  const currentGuide = CONTENT_DIMENSION_GUIDES[tab];
  const currentFormGuide = CONTENT_DIMENSION_GUIDES[form.type];

  return (
    <div className="page-stack">
      <PageHeader
        title="内容维度"
        description="这里维护站点内容主结构。教材版本负责整站范围，学科负责首页导航，年级和学期只负责课程筛选层级，不再按普通字典处理。"
        actions={
          <button className="button button-primary" onClick={openCreateModal} type="button">
            新增{CONTENT_DIMENSION_LABELS[tab]}
          </button>
        }
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <Panel
        title="结构分工"
        subtitle="内容维度负责前台主结构和课程筛选链路，和通用字典的辅助枚举是两套不同能力。"
      >
        <div className="admin-guide-grid">
          {CONTENT_DIMENSION_TYPES.map((type) => {
            const guide = CONTENT_DIMENSION_GUIDES[type];
            const count = dimensions.dimensions[type].length;
            const active = type === tab;

            return (
              <article className={`admin-guide-card${active ? ' is-active' : ''}`} key={type}>
                <span className="admin-guide-eyebrow">{guide.eyebrow}</span>
                <h4>{CONTENT_DIMENSION_LABELS[type]}</h4>
                <p className="admin-guide-copy">{guide.title}</p>
                <ul className="admin-guide-list">
                  {guide.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="admin-guide-card-footer">
                  <span>{guide.effect}</span>
                  <strong>{formatNumber(count)} 项</strong>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      <section className="summary-strip">
        <article className="summary-card summary-card-blue">
          <div>
            <span>内容结构总数</span>
            <strong>{formatNumber(totalCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
        <article className="summary-card summary-card-green">
          <div>
            <span>已启用维度</span>
            <strong>{formatNumber(enabledCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
        <article className="summary-card summary-card-gold">
          <div>
            <span>{currentMeta?.label ?? CONTENT_DIMENSION_LABELS[tab]}项数</span>
            <strong>{formatNumber(filteredItems.length)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
      </section>

      <Panel title="维度切换" subtitle={`${currentMeta?.description ?? ''} ${currentGuide.effect}`.trim()}>
        <div className="page-stack">
          <Tabs items={dimensions.dimension_types.map((item) => ({ value: item.type, label: item.label }))} value={tab} onChange={setTab} variant="button" />
          <form className="list-toolbar" onSubmit={(event) => event.preventDefault()}>
            <div className="list-toolbar-main">
              <label className="field field-compact field-grow">
                <input
                  placeholder={`搜索${CONTENT_DIMENSION_LABELS[tab]}名称或编码`}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </label>
            </div>
            <div className="list-toolbar-actions">
              <span className="toolbar-meta">共 {formatNumber(filteredItems.length)} 项</span>
            </div>
          </form>
        </div>
      </Panel>

      {loading ? <LoadingBlock text="正在加载内容维度…" /> : null}

      {!loading ? (
        <Panel
          title={`${currentMeta?.label ?? CONTENT_DIMENSION_LABELS[tab]}结构项`}
          subtitle={currentGuide.title}
        >
          {filteredItems.length === 0 ? (
            <EmptyState title={`暂无${CONTENT_DIMENSION_LABELS[tab]}`} description="先补齐结构维度，再去课程列表绑定课程内容和筛选范围。" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>维度项</th>
                    <th>角色定位</th>
                    <th>关联范围</th>
                    <th>前台 / 课程影响</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="table-title">{item.item_name}</div>
                        <div className="table-subtitle">
                          {item.item_code} · 排序 {item.sort_order}
                        </div>
                      </td>
                      <td>
                        <div className="table-title">{CONTENT_DIMENSION_GUIDES[item.type].title}</div>
                        <div className="table-subtitle">{CONTENT_DIMENSION_GUIDES[item.type].effect}</div>
                      </td>
                      <td>
                        <div className="table-subtitle">{renderRelationSummary(item)}</div>
                      </td>
                      <td>
                        <div className="action-row action-row-wrap">
                          {item.type === 'version' ? (
                            <Badge tone={item.flags.is_default ? 'gold' : 'slate'}>
                              {item.flags.is_default ? '默认版本' : '普通版本'}
                            </Badge>
                          ) : null}
                          {item.type === 'subject' ? (
                            <Badge tone={item.flags.home_visible ? 'blue' : 'slate'}>
                              {item.flags.home_visible ? '首页显示' : '首页隐藏'}
                            </Badge>
                          ) : null}
                          {item.type !== 'version' && item.type !== 'subject' ? <Badge tone="slate">课程筛选维度</Badge> : null}
                        </div>
                        <div className="table-subtitle">已关联课程 {formatNumber(item.metrics.course_count)} 门</div>
                      </td>
                      <td>
                        <div className="action-row">
                          <Badge tone={item.status === 'enabled' ? 'green' : 'slate'}>
                            {item.status === 'enabled' ? '启用' : '停用'}
                          </Badge>
                        </div>
                      </td>
                      <td>{formatDateTime(item.updated_at)}</td>
                      <td>
                        <div className="table-actions">
                          <ActionIconButton icon="edit" label="编辑维度项" onClick={() => openEditModal(item)} />
                          <ActionIconButton
                            disabled={submitting}
                            icon="delete"
                            label="删除维度项"
                            onClick={() => void removeDimension(item)}
                            tone="danger"
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
      ) : null}

      <Modal open={modalOpen} title={form.id ? `编辑${CONTENT_DIMENSION_LABELS[form.type]}` : `新增${CONTENT_DIMENSION_LABELS[form.type]}`} onClose={() => setModalOpen(false)} width="large">
        <form className="page-stack" onSubmit={saveDimension}>
          <div className="dialog-section-title">
            <strong>{currentFormMeta?.label ?? CONTENT_DIMENSION_LABELS[form.type]}</strong>
            <span>{currentFormMeta?.description} {currentFormGuide.title}</span>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>名称</span>
              <input
                required
                placeholder="请输入展示名称"
                value={form.item_name}
                onChange={(event) => setForm((current) => ({ ...current, item_name: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>编码</span>
              <input
                disabled={Boolean(form.id)}
                required
                placeholder="请输入唯一编码"
                value={form.item_code}
                onChange={(event) => setForm((current) => ({ ...current, item_code: event.target.value }))}
              />
            </label>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>状态</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <label className="field">
              <span>排序</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
              />
            </label>
          </div>

          {form.type === 'version' ? (
            <>
              <label className="checkbox-item">
                <input
                  checked={form.is_default}
                  onChange={(event) => setForm((current) => ({ ...current, is_default: event.target.checked }))}
                  type="checkbox"
                />
                <span>设为默认教材版本</span>
              </label>
              <label className="field">
                <span>关联首页学科</span>
                <div className="checkbox-grid">
                  {subjectOptions.map((item) => (
                    <label className="checkbox-item" key={item.id}>
                      <input
                        checked={form.subject_codes.includes(item.item_code)}
                        onChange={(event) => toggleSelection('subject_codes', item.item_code, event.target.checked)}
                        type="checkbox"
                      />
                      <span>{item.item_name}</span>
                    </label>
                  ))}
                </div>
              </label>
              <label className="field">
                <span>关联年级</span>
                <div className="checkbox-grid">
                  {gradeOptions.map((item) => (
                    <label className="checkbox-item" key={item.id}>
                      <input
                        checked={form.grade_codes.includes(item.item_code)}
                        onChange={(event) => toggleSelection('grade_codes', item.item_code, event.target.checked)}
                        type="checkbox"
                      />
                      <span>{item.item_name}</span>
                    </label>
                  ))}
                </div>
              </label>
            </>
          ) : null}

          {form.type === 'subject' ? (
            <>
              <label className="checkbox-item">
                <input
                  checked={form.home_visible}
                  onChange={(event) => setForm((current) => ({ ...current, home_visible: event.target.checked }))}
                  type="checkbox"
                />
                <span>在前台首页学科导航显示</span>
              </label>
              <label className="field">
                <span>适用教材版本</span>
                <div className="checkbox-grid">
                  {versionOptions.map((item) => (
                    <label className="checkbox-item" key={item.id}>
                      <input
                        checked={form.version_codes.includes(item.item_code)}
                        onChange={(event) => toggleSelection('version_codes', item.item_code, event.target.checked)}
                        type="checkbox"
                      />
                      <span>{item.item_name}</span>
                    </label>
                  ))}
                </div>
                <small className="field-hint">不勾选时表示适用于全部教材版本。</small>
              </label>
            </>
          ) : null}

          {form.type === 'grade' ? (
            <label className="field">
              <span>适用教材版本</span>
              <div className="checkbox-grid">
                {versionOptions.map((item) => (
                  <label className="checkbox-item" key={item.id}>
                    <input
                      checked={form.version_codes.includes(item.item_code)}
                      onChange={(event) => toggleSelection('version_codes', item.item_code, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{item.item_name}</span>
                  </label>
                ))}
              </div>
              <small className="field-hint">不勾选时表示适用于全部教材版本。</small>
            </label>
          ) : null}

          {form.type === 'term' ? (
            <label className="field">
              <span>适用年级</span>
              <div className="checkbox-grid">
                {gradeOptions.map((item) => (
                  <label className="checkbox-item" key={item.id}>
                    <input
                      checked={form.grade_codes.includes(item.item_code)}
                      onChange={(event) => toggleSelection('grade_codes', item.item_code, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{item.item_name}</span>
                  </label>
                ))}
              </div>
              <small className="field-hint">不勾选时表示适用于全部年级。</small>
            </label>
          ) : null}

          <div className="button-row">
            <button className="button button-primary" disabled={submitting} type="submit">
              保存{CONTENT_DIMENSION_LABELS[form.type]}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function renderRelationSummary(item: ContentDimensionItem) {
  switch (item.type) {
    case 'version':
      return joinRelationGroups([
        ['学科', item.relations.subject],
        ['年级', item.relations.grade],
      ]);
    case 'subject':
      return joinRelationGroups([['教材版本', item.relations.version]]);
    case 'grade':
      return joinRelationGroups([
        ['教材版本', item.relations.version],
        ['学期', item.relations.term],
      ]);
    case 'term':
      return joinRelationGroups([['年级', item.relations.grade]]);
  }
}

function joinRelationGroups(groups: Array<[string, Array<{ item_name: string }>]>): string {
  const parts = groups
    .map(([label, items]) => {
      if (items.length === 0) {
        return `${label}：全部`;
      }

      const names = items.slice(0, 3).map((entry) => entry.item_name).join('、');
      const suffix = items.length > 3 ? ` 等 ${items.length} 项` : '';
      return `${label}：${names}${suffix}`;
    })
    .filter(Boolean);

  return parts.join(' / ');
}
