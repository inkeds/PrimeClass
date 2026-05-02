'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

import {
  ActionIconButton,
  Banner,
  Badge,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
  Tabs,
} from '@/components/admin/AdminUI';
import { apiRequest, toQueryString, type ListPayload } from '@/components/admin/lib/api';
import { formatDateTime, formatNumber, parseJsonInput, stringifyJson } from '@/components/admin/lib/format';
import { getErrorMessage } from '@/components/admin/shared';

type DictionaryTypeFilter = 'all' | string;

type DictionaryItem = {
  id: string;
  type: string;
  type_name: string;
  type_status: string;
  type_remark: string | null;
  item_code: string;
  item_name: string;
  parent_id: string | null;
  sort_order: number;
  status: string;
  extra: Record<string, unknown>;
  updated_at: string;
};

const CORE_DICTIONARY_TYPES = new Set(['subject', 'grade', 'term', 'version']);
const GENERAL_DICTIONARY_GUIDES = [
  {
    eyebrow: '适合放这里',
    title: '辅助枚举与展示配置',
    points: ['推荐标签、角标文案、横幅样式', '筛选补充标签、运营标记、UI 枚举值'],
  },
  {
    eyebrow: '不要放这里',
    title: '不要维护站点内容主结构',
    points: ['教材版本、学科导航、年级、学期', '课程主筛选链路与首页结构入口'],
  },
  {
    eyebrow: '实际作用',
    title: '为其它模块提供轻量选项',
    points: ['给课程、专题、展示位补充可选标签', '不直接决定前台左上角版本和首页学科导航'],
  },
] as const;

const GENERAL_DICTIONARY_EXAMPLES = ['recommend_tag', 'badge_style', 'banner_theme', 'topic_marker'] as const;

export function DictionariesPage() {
  const [typeFilter, setTypeFilter] = useState<DictionaryTypeFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dictionaries, setDictionaries] = useState<DictionaryItem[]>([]);
  const [dictModalOpen, setDictModalOpen] = useState(false);
  const [dictForm, setDictForm] = useState<{
    id?: string;
    type: string;
    type_name: string;
    type_status: string;
    type_remark: string;
    item_code: string;
    item_name: string;
    parent_id: string;
    sort_order: string;
    status: string;
    extra: string;
  }>({
    type: '',
    type_name: '',
    type_status: 'enabled',
    type_remark: '',
    item_code: '',
    item_name: '',
    parent_id: '',
    sort_order: '0',
    status: 'enabled',
    extra: '{}',
  });

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setError('');

    try {
      const next = await apiRequest<ListPayload<DictionaryItem>>(
        `/dictionaries${toQueryString({ page: 1, page_size: 500, scope: 'general' })}`,
      );
      setDictionaries(next.list);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function openDictModal(item?: DictionaryItem) {
    setDictForm(
      item
        ? {
            id: item.id,
            type: item.type,
            type_name: item.type_name,
            type_status: item.type_status,
            type_remark: item.type_remark || '',
            item_code: item.item_code,
            item_name: item.item_name,
            parent_id: item.parent_id || '',
            sort_order: String(item.sort_order),
            status: item.status,
            extra: stringifyJson(item.extra),
          }
        : {
            type: typeFilter === 'all' ? '' : typeFilter,
            type_name: '',
            type_status: 'enabled',
            type_remark: '',
            item_code: '',
            item_name: '',
            parent_id: '',
            sort_order: '0',
            status: 'enabled',
            extra: '{}',
          },
    );
    setDictModalOpen(true);
  }

  async function saveDictionary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    if (CORE_DICTIONARY_TYPES.has(dictForm.type.trim())) {
      setSubmitting(false);
      setError('教材版本、学科、年级、学期请到“内容维度”页面维护。');
      return;
    }

    const payload = {
      type: dictForm.type.trim(),
      type_name: dictForm.type_name.trim() || undefined,
      type_status: dictForm.type_status,
      type_remark: dictForm.type_remark.trim() || null,
      item_code: dictForm.item_code.trim(),
      item_name: dictForm.item_name.trim(),
      parent_id: dictForm.parent_id.trim() || null,
      sort_order: Number(dictForm.sort_order || 0),
      status: dictForm.status,
      extra: parseJsonInput(dictForm.extra),
    };

    try {
      if (dictForm.id) {
        await apiRequest(`/dictionaries/${dictForm.id}`, { method: 'POST', body: payload });
      } else {
        await apiRequest('/dictionaries', { method: 'POST', body: payload });
      }

      setDictModalOpen(false);
      await bootstrap();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeDictionary(id: string) {
    if (!window.confirm('确认删除当前字典项吗？')) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await apiRequest(`/dictionaries/${id}/delete`, { method: 'POST' });
      await bootstrap();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const typeTabs = useMemo(
    () => [
      { value: 'all', label: '全部通用字典' },
      ...Array.from(new Set(dictionaries.map((item) => item.type)))
        .sort((left, right) => left.localeCompare(right, 'zh-CN'))
        .map((type) => ({ value: type, label: dictionaries.find((item) => item.type === type)?.type_name || type })),
    ],
    [dictionaries],
  );
  const filteredDictionaries = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return dictionaries.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return [item.type, item.type_name, item.item_code, item.item_name, item.type_remark || '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword);
    });
  }, [dictionaries, keyword, typeFilter]);
  const typeSummary = useMemo(
    () =>
      typeTabs
        .filter((item) => item.value !== 'all')
        .map((item) => {
          const count = dictionaries.filter((dictionary) => dictionary.type === item.value).length;
          return `${item.label} ${count}`;
        })
        .join(' / '),
    [dictionaries, typeTabs],
  );
  const enabledCount = dictionaries.filter((item) => item.status === 'enabled').length;
  const typeCount = new Set(dictionaries.map((item) => item.type)).size;
  const typeOptions = useMemo(
    () =>
      Array.from(new Set(dictionaries.map((item) => item.type)))
        .sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [dictionaries],
  );
  const parentOptions = useMemo(
    () => dictionaries.filter((item) => item.type === dictForm.type && item.id !== dictForm.id),
    [dictionaries, dictForm.id, dictForm.type],
  );

  return (
    <div className="page-stack">
      <PageHeader
        title="通用字典配置"
        description="这里只维护辅助枚举、展示标签和运营配置，不再承载教材版本、学科导航、年级、学期这类内容主结构。"
        actions={
          <button className="button button-primary" onClick={() => openDictModal()} type="button">
            新增通用字典
          </button>
        }
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <Panel
        title="作用边界"
        subtitle="通用字典只负责补充选项和展示规则，不参与前台首页版本切换、学科导航和课程主筛选链路。"
      >
        <div className="admin-guide-grid">
          {GENERAL_DICTIONARY_GUIDES.map((guide) => (
            <article className="admin-guide-card" key={guide.title}>
              <span className="admin-guide-eyebrow">{guide.eyebrow}</span>
              <h4>{guide.title}</h4>
              <ul className="admin-guide-list">
                {guide.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="admin-guide-tags">
          {GENERAL_DICTIONARY_EXAMPLES.map((example) => (
            <span className="admin-guide-tag" key={example}>
              {example}
            </span>
          ))}
        </div>
      </Panel>

      <section className="summary-strip">
        <article className="summary-card summary-card-blue">
          <div>
            <span>通用字典类型</span>
            <strong>{formatNumber(typeCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
        <article className="summary-card summary-card-green">
          <div>
            <span>启用字典项</span>
            <strong>{formatNumber(enabledCount)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
        <article className="summary-card summary-card-gold">
          <div>
            <span>当前筛选结果</span>
            <strong>{formatNumber(filteredDictionaries.length)}</strong>
          </div>
          <div className="summary-card-icon" aria-hidden="true" />
        </article>
      </section>

      <Panel title="通用字典筛选" subtitle={typeSummary || '当前接口已排除课程核心维度，只保留辅助字典。'}>
        <div className="page-stack">
          <Tabs items={typeTabs} value={typeFilter} onChange={setTypeFilter} variant="button" />
          <form className="list-toolbar" onSubmit={(event) => event.preventDefault()}>
            <div className="list-toolbar-main">
              <label className="field field-compact field-grow">
                <input
                  placeholder="按类型、编码、名称筛选"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </label>
            </div>
            <div className="list-toolbar-actions">
              <span className="toolbar-meta">共 {formatNumber(filteredDictionaries.length)} 项</span>
            </div>
          </form>
        </div>
      </Panel>

      {loading ? <LoadingBlock text="正在加载通用字典…" /> : null}

      {!loading ? (
        <Panel
          title="通用字典项"
          subtitle="适合承载推荐标签、展示风格、辅助枚举等轻量配置，不直接决定前台内容结构。"
        >
          {filteredDictionaries.length === 0 ? (
            <EmptyState title="暂无通用字典" description="课程核心维度请前往内容维度页面，其他辅助配置可以在这里新增。" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>字典类型</th>
                    <th>主要作用</th>
                    <th>字典项</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDictionaries.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="table-title">{item.type_name || item.type}</div>
                        <div className="table-subtitle">{item.type}</div>
                      </td>
                      <td>
                        <div className="table-title">{getDictionaryUsage(item)}</div>
                        <div className="table-subtitle">不参与教材版本、学科、年级、学期主链路</div>
                      </td>
                      <td>
                        <div className="table-title">{item.item_name}</div>
                        <div className="table-subtitle">
                          {item.item_code} · 排序 {item.sort_order}
                        </div>
                        <div className="table-subtitle">{summarizeDictionaryExtra(item.extra)}</div>
                      </td>
                      <td>
                        <div className="action-row">
                          <Badge tone={item.type_status === 'enabled' ? 'green' : 'slate'}>
                            类型{item.type_status === 'enabled' ? '启用' : '停用'}
                          </Badge>
                          <Badge tone={item.status === 'enabled' ? 'blue' : 'slate'}>
                            项{item.status === 'enabled' ? '启用' : '停用'}
                          </Badge>
                        </div>
                      </td>
                      <td>{formatDateTime(item.updated_at)}</td>
                      <td>
                        <div className="table-actions">
                          <ActionIconButton icon="edit" label="编辑字典项" onClick={() => openDictModal(item)} />
                          <ActionIconButton
                            disabled={submitting}
                            icon="delete"
                            label="删除字典项"
                            onClick={() => void removeDictionary(item.id)}
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

      <Modal open={dictModalOpen} title={dictForm.id ? '编辑通用字典' : '新增通用字典'} onClose={() => setDictModalOpen(false)}>
        <form className="page-stack" onSubmit={saveDictionary}>
          <div className="dialog-section-title">
            <strong>通用字典项</strong>
            <span>用于维护通用标签、展示样式、推荐枚举等辅助配置。教材版本、学科、年级、学期请到“内容维度”维护。</span>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>字典类型</span>
              <input
                list="dictionary-type-options"
                required
                placeholder="例如：recommend_tag / banner_theme"
                value={dictForm.type}
                onChange={(event) => setDictForm((current) => ({ ...current, type: event.target.value }))}
              />
              <datalist id="dictionary-type-options">
                {typeOptions.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>字典类型名称</span>
              <input
                placeholder="例如：推荐标签 / 横幅主题"
                value={dictForm.type_name}
                onChange={(event) => setDictForm((current) => ({ ...current, type_name: event.target.value }))}
              />
            </label>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>字典项名称</span>
              <input
                required
                placeholder="请输入展示名称"
                value={dictForm.item_name}
                onChange={(event) => setDictForm((current) => ({ ...current, item_name: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>字典项编码</span>
              <input
                required
                placeholder="请输入唯一编码"
                value={dictForm.item_code}
                onChange={(event) => setDictForm((current) => ({ ...current, item_code: event.target.value }))}
              />
            </label>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>父级字典项</span>
              <select
                value={dictForm.parent_id}
                onChange={(event) => setDictForm((current) => ({ ...current, parent_id: event.target.value }))}
              >
                <option value="">无父级</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.item_name} · {item.item_code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>排序</span>
              <input
                type="number"
                value={dictForm.sort_order}
                onChange={(event) => setDictForm((current) => ({ ...current, sort_order: event.target.value }))}
              />
            </label>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>类型状态</span>
              <select
                value={dictForm.type_status}
                onChange={(event) => setDictForm((current) => ({ ...current, type_status: event.target.value }))}
              >
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <label className="field">
              <span>字典项状态</span>
              <select
                value={dictForm.status}
                onChange={(event) => setDictForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="enabled">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>类型备注</span>
            <input
              placeholder="给后台运营看的说明"
              value={dictForm.type_remark}
              onChange={(event) => setDictForm((current) => ({ ...current, type_remark: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>额外配置 JSON</span>
            <textarea
              rows={6}
              value={dictForm.extra}
              onChange={(event) => setDictForm((current) => ({ ...current, extra: event.target.value }))}
            />
            <small className="field-hint">用于补充业务方自定义枚举信息，例如图标、颜色、跳转标记等。</small>
          </label>

          <div className="button-row">
            <button className="button button-primary" disabled={submitting} type="submit">
              保存通用字典
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function getDictionaryUsage(item: DictionaryItem) {
  if (item.type_remark?.trim()) {
    return item.type_remark.trim();
  }

  return '用于补充模块枚举、标签文案或展示样式';
}

function summarizeDictionaryExtra(extra: Record<string, unknown>) {
  const keys = Object.keys(extra);

  if (keys.length === 0) {
    return '未配置扩展字段';
  }

  const visibleKeys = keys.slice(0, 3).join(' / ');
  const suffix = keys.length > 3 ? ` 等 ${keys.length} 项` : '';
  return `扩展字段：${visibleKeys}${suffix}`;
}
