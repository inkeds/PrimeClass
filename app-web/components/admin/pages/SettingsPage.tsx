'use client';

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
import { formatDateTime, formatNumber, stringifyJson, tryParseJsonInput } from '@/components/admin/lib/format';
import { getErrorMessage } from '@/components/admin/shared';

type SettingsTab = 'basic' | 'display' | 'upload' | 'storage' | 'notifications';

type SettingItem = {
  id: string;
  key: string;
  name: string;
  value_type: string;
  value: unknown;
  is_encrypted: boolean;
  updated_at: string;
};

type StorageProvider = 'local' | 's3' | 'tencent_cos' | 'ftp';

type StorageProviderConfig = {
  provider: StorageProvider;
  is_enabled: boolean;
  is_default: boolean;
  config: Record<string, unknown>;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
  updated_at: string | null;
};

type StorageSettings = {
  default_provider: StorageProvider;
  providers: Record<StorageProvider, StorageProviderConfig>;
};

type StorageFieldType = 'text' | 'password' | 'number' | 'checkbox';

type StorageFieldDefinition = {
  key: string;
  label: string;
  type: StorageFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

type StorageEditorState = {
  provider: StorageProvider;
  is_enabled: boolean;
  config: Record<string, unknown>;
};

type SettingCategoryResponse = {
  settings: Record<string, unknown>;
  items: SettingItem[];
};

type NotificationTone = 'info' | 'warning' | 'success' | 'vip';
type NotificationStatus = 'draft' | 'published' | 'disabled';

type SystemNotification = {
  notification_id: string;
  title: string;
  content: string;
  tone: NotificationTone;
  status: NotificationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationEditorState = {
  notification_id: string | null;
  title: string;
  content: string;
  tone: NotificationTone;
  status: NotificationStatus;
};

type SettingsPageProps = {
  standaloneTab?: SettingsTab | null;
};

const categories: Array<{ value: Exclude<SettingsTab, 'storage' | 'notifications'>; label: string }> = [
  { value: 'basic', label: '基础设置' },
  { value: 'display', label: '展示设置' },
  { value: 'upload', label: '上传设置' },
];

const storageProviderOrder: StorageProvider[] = ['local', 's3', 'tencent_cos', 'ftp'];

const storageProviderDefinitions: Record<
  StorageProvider,
  {
    label: string;
    description: string;
    fields: StorageFieldDefinition[];
    summaryKeys: string[];
    defaultConfig: Record<string, unknown>;
  }
> = {
  local: {
    label: '本地存储',
    description: '文件直接落在当前服务器目录，适合单机部署。',
    summaryKeys: ['root_path', 'public_base_url'],
    defaultConfig: {
      root_path: './uploads',
      public_base_url: '',
      prefix: '',
    },
    fields: [
      { key: 'root_path', label: '根目录', type: 'text', required: true, placeholder: './uploads' },
      { key: 'public_base_url', label: '访问域名', type: 'text', placeholder: 'https://static.example.com' },
      { key: 'prefix', label: '上传前缀', type: 'text', placeholder: 'media/' },
    ],
  },
  s3: {
    label: 'S3 存储桶',
    description: '适配 Amazon S3 和兼容 S3 协议的对象存储。',
    summaryKeys: ['bucket', 'region', 'endpoint'],
    defaultConfig: {
      bucket: '',
      region: '',
      endpoint: '',
      access_key: '',
      secret_key: '',
      public_base_url: '',
      prefix: '',
      force_path_style: false,
    },
    fields: [
      { key: 'bucket', label: 'Bucket', type: 'text', required: true, placeholder: 'primeclass-prod' },
      { key: 'region', label: '区域', type: 'text', required: true, placeholder: 'ap-guangzhou' },
      { key: 'endpoint', label: '自定义 Endpoint', type: 'text', placeholder: 'https://s3.ap-guangzhou.amazonaws.com' },
      { key: 'access_key', label: 'Access Key', type: 'text', required: true },
      { key: 'secret_key', label: 'Secret Key', type: 'password', required: true },
      { key: 'public_base_url', label: '访问域名', type: 'text', placeholder: 'https://cdn.example.com' },
      { key: 'prefix', label: '上传前缀', type: 'text', placeholder: 'course/' },
      { key: 'force_path_style', label: '强制 Path Style', type: 'checkbox', hint: '兼容 MinIO、部分私有对象存储。' },
    ],
  },
  tencent_cos: {
    label: '腾讯云 COS',
    description: '适合腾讯云对象存储桶接入。',
    summaryKeys: ['bucket', 'region'],
    defaultConfig: {
      bucket: '',
      region: '',
      secret_id: '',
      secret_key: '',
      public_base_url: '',
      prefix: '',
    },
    fields: [
      { key: 'bucket', label: 'Bucket', type: 'text', required: true, placeholder: 'primeclass-1250000000' },
      { key: 'region', label: '所属地域', type: 'text', required: true, placeholder: 'ap-guangzhou' },
      { key: 'secret_id', label: 'SecretId', type: 'text', required: true },
      { key: 'secret_key', label: 'SecretKey', type: 'password', required: true },
      { key: 'public_base_url', label: '访问域名', type: 'text', placeholder: 'https://cdn.example.com' },
      { key: 'prefix', label: '上传前缀', type: 'text', placeholder: 'course/' },
    ],
  },
  ftp: {
    label: 'FTP 存储',
    description: '适合已有文件服务器或 NAS 挂载环境。',
    summaryKeys: ['host', 'root_path'],
    defaultConfig: {
      host: '',
      port: 21,
      username: '',
      password: '',
      root_path: '/',
      public_base_url: '',
      prefix: '',
      secure: false,
    },
    fields: [
      { key: 'host', label: '服务器地址', type: 'text', required: true, placeholder: '192.168.1.20' },
      { key: 'port', label: '端口', type: 'number', required: true, placeholder: '21' },
      { key: 'username', label: '账号', type: 'text', required: true },
      { key: 'password', label: '密码', type: 'password', required: true },
      { key: 'root_path', label: '根目录', type: 'text', required: true, placeholder: '/uploads' },
      { key: 'public_base_url', label: '访问域名', type: 'text', placeholder: 'https://static.example.com' },
      { key: 'prefix', label: '上传前缀', type: 'text', placeholder: 'course/' },
      { key: 'secure', label: '启用 FTPS', type: 'checkbox', hint: '连接支持显式或隐式安全传输时开启。' },
    ],
  },
};

function createDefaultStorageConfig(provider: StorageProvider) {
  return { ...storageProviderDefinitions[provider].defaultConfig };
}

function createStorageEditor(provider: StorageProvider, settings: StorageSettings): StorageEditorState {
  const current = settings.providers[provider];

  return {
    provider,
    is_enabled: current.is_enabled,
    config: {
      ...createDefaultStorageConfig(provider),
      ...current.config,
    },
  };
}

function hasStorageProviderConfigured(item: StorageProviderConfig) {
  if (item.is_enabled || item.is_default) {
    return true;
  }

  const defaults = storageProviderDefinitions[item.provider].defaultConfig;

  return Object.keys(defaults).some((key) => {
    const value = item.config[key];

    if (value === null || value === undefined || value === '') {
      return false;
    }

    return value !== defaults[key];
  });
}

function getStorageSummary(item: StorageProviderConfig) {
  const providerDefinition = storageProviderDefinitions[item.provider];
  const fieldMap = new Map(providerDefinition.fields.map((field) => [field.key, field.label]));

  return providerDefinition.summaryKeys
    .map((key) => {
      const value = item.config[key];

      if (value === null || value === undefined || value === '') {
        return null;
      }

      return {
        key,
        label: fieldMap.get(key) || key,
        value: String(value),
      };
    })
    .filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry));
}

function getStorageStatusTone(status?: string | null) {
  if (status === 'success') {
    return 'green' as const;
  }

  if (status === 'failed') {
    return 'red' as const;
  }

  return 'slate' as const;
}

function getStorageStatusLabel(status?: string | null) {
  if (status === 'success') {
    return '测试通过';
  }

  if (status === 'failed') {
    return '测试失败';
  }

  return '未测试';
}

function getStorageProviderMark(provider: StorageProvider) {
  switch (provider) {
    case 'local':
      return 'LOC';
    case 's3':
      return 'S3';
    case 'tencent_cos':
      return 'COS';
    case 'ftp':
      return 'FTP';
  }
}

function createNotificationEditor(notification?: SystemNotification | null): NotificationEditorState {
  return {
    notification_id: notification?.notification_id ?? null,
    title: notification?.title ?? '',
    content: notification?.content ?? '',
    tone: notification?.tone ?? 'info',
    status: notification?.status ?? 'published',
  };
}

function getNotificationToneBadge(tone: NotificationTone) {
  switch (tone) {
    case 'warning':
      return { label: '提醒', tone: 'gold' as const };
    case 'success':
      return { label: '成功', tone: 'green' as const };
    case 'vip':
      return { label: '会员', tone: 'violet' as const };
    default:
      return { label: '普通', tone: 'blue' as const };
  }
}

function getNotificationStatusBadge(status: NotificationStatus) {
  switch (status) {
    case 'published':
      return { label: '已发布', tone: 'green' as const };
    case 'disabled':
      return { label: '已停用', tone: 'red' as const };
    default:
      return { label: '草稿', tone: 'slate' as const };
  }
}

export function SettingsPage({ standaloneTab = null }: SettingsPageProps = {}) {
  const notificationOnly = standaloneTab === 'notifications';
  const [tab, setTab] = useState<SettingsTab>(standaloneTab ?? 'basic');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [categoryData, setCategoryData] = useState<Record<string, SettingCategoryResponse>>({
    basic: { settings: {}, items: [] },
    display: { settings: {}, items: [] },
    upload: { settings: {}, items: [] },
  });
  const [storageSettings, setStorageSettings] = useState<StorageSettings | null>(null);
  const [storageEditor, setStorageEditor] = useState<StorageEditorState | null>(null);
  const [storageModalOpen, setStorageModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [notificationEditor, setNotificationEditor] = useState<NotificationEditorState>(createNotificationEditor());
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [standaloneTab]);

  async function bootstrap() {
    setLoading(true);
    setError('');

    try {
      if (notificationOnly) {
        const notificationResponse = await apiRequest<ListPayload<SystemNotification>>('/settings/notifications');
        setNotifications(notificationResponse.list);
        return;
      }

      const [basic, display, upload, storage] = await Promise.all([
        apiRequest<SettingCategoryResponse>('/settings/basic'),
        apiRequest<SettingCategoryResponse>('/settings/display'),
        apiRequest<SettingCategoryResponse>('/settings/upload'),
        apiRequest<StorageSettings>('/settings/storage'),
      ]);

      setCategoryData({
        basic,
        display,
        upload,
      });
      setStorageSettings(storage);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function updateSettingValue(category: keyof typeof categoryData, key: string, value: unknown) {
    setCategoryData((current) => ({
      ...current,
      [category]: {
        ...current[category],
        items: current[category].items.map((item) => (item.key === key ? { ...item, value } : item)),
      },
    }));
  }

  async function saveCategory(category: keyof typeof categoryData) {
    setSubmitting(true);

    try {
      const payload = Object.fromEntries(
        categoryData[category].items.map((item) => [item.key, item.value]),
      );

      const next = await apiRequest<SettingCategoryResponse>(`/settings/${category}`, {
        method: 'POST',
        body: payload,
      });

      setCategoryData((current) => ({
        ...current,
        [category]: next,
      }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveStorage() {
    if (!storageSettings) {
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        default_provider: storageSettings.default_provider,
        providers: Object.fromEntries(
          Object.entries(storageSettings.providers).map(([provider, config]) => [
            provider,
            {
              is_enabled: config.is_enabled,
              config: config.config,
            },
          ]),
        ),
      };

      const next = await apiRequest<StorageSettings>('/settings/storage', {
        method: 'POST',
        body: payload,
      });

      setStorageSettings(next);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function testStorage(provider: StorageProvider) {
    if (!storageSettings) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest('/settings/storage/test', {
        method: 'POST',
        body: {
          provider,
          config: storageSettings.providers[provider].config,
        },
      });

      const next = await apiRequest<StorageSettings>('/settings/storage');
      setStorageSettings(next);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function openStorageEditor(provider: StorageProvider) {
    if (!storageSettings) {
      return;
    }

    setStorageEditor(createStorageEditor(provider, storageSettings));
    setStorageModalOpen(true);
  }

  function closeStorageEditor() {
    setStorageModalOpen(false);
    setStorageEditor(null);
  }

  function openNotificationEditor(notification?: SystemNotification) {
    setNotificationEditor(createNotificationEditor(notification));
    setNotificationModalOpen(true);
  }

  function closeNotificationEditor() {
    setNotificationModalOpen(false);
    setNotificationEditor(createNotificationEditor());
  }

  function updateStorageEditorConfig(key: string, value: unknown) {
    setStorageEditor((current) =>
      current
        ? {
            ...current,
            config: {
              ...current.config,
              [key]: value,
            },
          }
        : current,
    );
  }

  function applyStorageEditor() {
    if (!storageSettings || !storageEditor) {
      return;
    }

    const provider = storageEditor.provider;

    setStorageSettings({
      ...storageSettings,
      providers: {
        ...storageSettings.providers,
        [provider]: {
          ...storageSettings.providers[provider],
          is_enabled: storageEditor.is_enabled,
          config: {
            ...createDefaultStorageConfig(provider),
            ...storageEditor.config,
          },
        },
      },
    });

    closeStorageEditor();
  }

  function setDefaultStorageProvider(provider: StorageProvider) {
    setStorageSettings((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        default_provider: provider,
        providers: Object.fromEntries(
          storageProviderOrder.map((itemProvider) => [
            itemProvider,
            {
              ...current.providers[itemProvider],
              is_default: itemProvider === provider,
              is_enabled:
                itemProvider === provider ? true : current.providers[itemProvider].is_enabled,
            },
          ]),
        ) as Record<StorageProvider, StorageProviderConfig>,
      };
    });
  }

  function resetStorageProvider(provider: StorageProvider) {
    if (!window.confirm('确认重置当前存储通道配置吗？')) {
      return;
    }

    setStorageSettings((current) => {
      if (!current) {
        return current;
      }

      const nextDefault = current.default_provider === provider ? 'local' : current.default_provider;

      const nextProviders = Object.fromEntries(
        storageProviderOrder.map((itemProvider) => {
          if (itemProvider === provider) {
            return [
              itemProvider,
              {
                ...current.providers[itemProvider],
                is_enabled: itemProvider === 'local' && nextDefault === 'local',
                is_default: itemProvider === nextDefault,
                config: createDefaultStorageConfig(itemProvider),
                last_test_at: null,
                last_test_status: null,
                last_test_message: null,
              },
            ];
          }

          if (itemProvider === nextDefault) {
            return [
              itemProvider,
              {
                ...current.providers[itemProvider],
                is_enabled: true,
                is_default: true,
              },
            ];
          }

          return [
            itemProvider,
            {
              ...current.providers[itemProvider],
              is_default: false,
            },
          ];
        }),
      ) as Record<StorageProvider, StorageProviderConfig>;

      return {
        ...current,
        default_provider: nextDefault,
        providers: nextProviders,
      };
    });
  }

  const configuredStorageProviders = storageSettings
    ? storageProviderOrder
        .map((provider) => storageSettings.providers[provider])
        .filter((item) => hasStorageProviderConfigured(item))
    : [];

  const availableStorageProviders = storageSettings
    ? storageProviderOrder.filter(
        (provider) => !configuredStorageProviders.some((item) => item.provider === provider),
      )
    : [];

  const activeStorageFields = storageEditor
    ? storageProviderDefinitions[storageEditor.provider].fields
    : [];

  const activeStorageTextFields = activeStorageFields.filter((field) => field.type !== 'checkbox');
  const activeStorageToggleFields = activeStorageFields.filter((field) => field.type === 'checkbox');
  const totalSettingItems = Object.values(categoryData).reduce((count, category) => count + category.items.length, 0);
  const publishedNotificationCount = notifications.filter((item) => item.status === 'published').length;
  const draftNotificationCount = notifications.filter((item) => item.status === 'draft').length;
  const disabledNotificationCount = notifications.filter((item) => item.status === 'disabled').length;

  async function submitNotificationEditor() {
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        title: notificationEditor.title,
        content: notificationEditor.content,
        tone: notificationEditor.tone,
        status: notificationEditor.status,
      };

      const next = notificationEditor.notification_id
        ? await apiRequest<ListPayload<SystemNotification>>(
            `/settings/notifications/${notificationEditor.notification_id}`,
            {
              method: 'POST',
              body: payload,
            },
          )
        : await apiRequest<ListPayload<SystemNotification>>('/settings/notifications', {
            method: 'POST',
            body: payload,
          });

      setNotifications(next.list);
      closeNotificationEditor();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateNotificationStatus(item: SystemNotification, status: NotificationStatus) {
    setSubmitting(true);
    setError('');

    try {
      const next = await apiRequest<ListPayload<SystemNotification>>(
        `/settings/notifications/${item.notification_id}`,
        {
          method: 'POST',
          body: {
            title: item.title,
            content: item.content,
            tone: item.tone,
            status,
          },
        },
      );

      setNotifications(next.list);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={notificationOnly ? '通知发布' : '系统设置'}
        description={
          notificationOnly
            ? '前台站内通知、会员提醒和公告统一在这里发布。'
            : '维护基础配置、展示文案、上传约束和存储通道。'
        }
        actions={
          notificationOnly ? (
            <>
              <button className="button button-secondary" onClick={() => void bootstrap()} type="button">
                刷新列表
              </button>
              <button className="button button-primary" onClick={() => openNotificationEditor()} type="button">
                发布通知
              </button>
            </>
          ) : (
            <button className="button button-secondary" onClick={() => void bootstrap()} type="button">
              刷新设置
            </button>
          )
        }
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <section className="summary-strip">
        {notificationOnly ? (
          <>
            <article className="summary-card summary-card-blue">
              <div>
                <span>通知总数</span>
                <strong>{formatNumber(notifications.length)}</strong>
              </div>
              <div className="summary-card-icon" aria-hidden="true" />
            </article>
            <article className="summary-card summary-card-green">
              <div>
                <span>已发布</span>
                <strong>{formatNumber(publishedNotificationCount)}</strong>
              </div>
              <div className="summary-card-icon" aria-hidden="true" />
            </article>
            <article className="summary-card summary-card-gold">
              <div>
                <span>草稿 / 停用</span>
                <strong>{formatNumber(draftNotificationCount + disabledNotificationCount)}</strong>
              </div>
              <div className="summary-card-icon" aria-hidden="true" />
            </article>
          </>
        ) : (
          <>
            <article className="summary-card summary-card-blue">
              <div>
                <span>配置项</span>
                <strong>{formatNumber(totalSettingItems)}</strong>
              </div>
              <div className="summary-card-icon" aria-hidden="true" />
            </article>
            <article className="summary-card summary-card-green">
              <div>
                <span>已配置存储通道</span>
                <strong>{formatNumber(configuredStorageProviders.length)}</strong>
              </div>
              <div className="summary-card-icon" aria-hidden="true" />
            </article>
            <article className="summary-card summary-card-gold">
              <div>
                <span>默认存储通道</span>
                <strong>{storageSettings ? storageProviderDefinitions[storageSettings.default_provider].label : '--'}</strong>
              </div>
              <div className="summary-card-icon" aria-hidden="true" />
            </article>
          </>
        )}
      </section>

      {!notificationOnly ? (
        <Tabs
          items={[
            { value: 'basic', label: '基础设置' },
            { value: 'display', label: '展示设置' },
            { value: 'upload', label: '上传设置' },
            { value: 'storage', label: '存储设置' },
          ]}
          value={tab}
          onChange={setTab}
          variant="button"
        />
      ) : null}

      {loading ? <LoadingBlock text="正在加载系统配置…" /> : null}

      {!loading && categories.some((item) => item.value === tab) ? (
        <Panel
          title={categories.find((item) => item.value === tab)?.label || ''}
          actions={
            <button className="button button-primary" disabled={submitting} onClick={() => void saveCategory(tab as keyof typeof categoryData)} type="button">
              保存设置
            </button>
          }
        >
          <div className="page-stack">
            {categoryData[tab as keyof typeof categoryData].items.map((item) => (
              <label className="field" key={item.id}>
                <span>
                  {item.name} <em>{item.key}</em>
                </span>
                {item.value_type === 'bool' ? (
                  <label className="checkbox-item checkbox-item-inline">
                    <input
                      checked={Boolean(item.value)}
                      onChange={(event) =>
                        updateSettingValue(tab as keyof typeof categoryData, item.key, event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>{Boolean(item.value) ? '已开启' : '未开启'}</span>
                  </label>
                ) : item.value_type === 'json' ? (
                  <textarea
                    rows={4}
                    value={stringifyJson(item.value)}
                    onChange={(event) => {
                      const nextValue = tryParseJsonInput(event.target.value);

                      if (nextValue) {
                        updateSettingValue(tab as keyof typeof categoryData, item.key, nextValue);
                      }
                    }}
                  />
                ) : (
                  <input
                    type={item.value_type === 'int' ? 'number' : 'text'}
                    value={String(item.value ?? '')}
                    onChange={(event) =>
                      updateSettingValue(
                        tab as keyof typeof categoryData,
                        item.key,
                        item.value_type === 'int' ? Number(event.target.value) : event.target.value,
                      )
                    }
                  />
                )}
                <small>最后更新：{formatDateTime(item.updated_at)}</small>
              </label>
            ))}
          </div>
        </Panel>
      ) : null}

      {!loading && tab === 'storage' && storageSettings ? (
        <Panel
          title="存储设置"
          subtitle={`当前默认：${storageProviderDefinitions[storageSettings.default_provider].label}`}
          actions={
            <button className="button button-primary" disabled={submitting} onClick={() => void saveStorage()} type="button">
              保存存储配置
            </button>
          }
        >
          <div className="page-stack">
            <Banner tone="info">新增或编辑通道后，点击“保存存储配置”才会正式写入系统。</Banner>

            <section className="storage-section">
              <div className="storage-section-header">
                <div>
                  <h4>已添加通道</h4>
                  <p>已配置的存储通道会显示在这里，可继续编辑、设为默认或测试连接。</p>
                </div>
                <Badge tone="blue">{configuredStorageProviders.length} 个通道</Badge>
              </div>

              {configuredStorageProviders.length === 0 ? (
                <EmptyState title="暂未添加存储通道" description="先从下方选择一个通道类型进行配置。" />
              ) : (
                <div className="storage-grid">
                  {configuredStorageProviders.map((provider) => {
                    const providerDefinition = storageProviderDefinitions[provider.provider];
                    const summary = getStorageSummary(provider);

                    return (
                      <article className={`storage-card storage-card-${provider.provider}`} key={provider.provider}>
                        <div className="storage-card-top">
                          <div className={`storage-provider-mark storage-provider-mark-${provider.provider}`}>
                            {getStorageProviderMark(provider.provider)}
                          </div>

                          <div className="storage-card-main">
                            <div className="storage-card-header">
                              <div>
                                <strong>{providerDefinition.label}</strong>
                                <p>{providerDefinition.description}</p>
                              </div>
                              <div className="storage-card-actions">
                                <ActionIconButton
                                  icon="edit"
                                  label="编辑通道"
                                  onClick={() => openStorageEditor(provider.provider)}
                                />
                                <ActionIconButton
                                  disabled={submitting}
                                  icon="open"
                                  label="测试连接"
                                  onClick={() => void testStorage(provider.provider)}
                                  tone="soft"
                                />
                                {!provider.is_default ? (
                                  <ActionIconButton
                                    icon="lock"
                                    label="设为默认"
                                    onClick={() => setDefaultStorageProvider(provider.provider)}
                                    tone="soft"
                                  />
                                ) : null}
                                <ActionIconButton
                                  icon="delete"
                                  label="重置配置"
                                  onClick={() => resetStorageProvider(provider.provider)}
                                  tone="danger"
                                />
                              </div>
                            </div>

                            <div className="storage-badges">
                              {provider.is_default ? <Badge tone="gold">默认通道</Badge> : null}
                              <Badge tone={provider.is_enabled ? 'green' : 'slate'}>
                                {provider.is_enabled ? '已启用' : '未启用'}
                              </Badge>
                              <Badge tone={getStorageStatusTone(provider.last_test_status)}>
                                {getStorageStatusLabel(provider.last_test_status)}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="storage-summary-list">
                          {summary.length > 0 ? (
                            summary.map((entry) => (
                              <div className="storage-summary-item" key={entry.key}>
                                <span>{entry.label}</span>
                                <strong>{entry.value}</strong>
                              </div>
                            ))
                          ) : (
                            <div className="storage-summary-item is-empty">
                              <span>配置状态</span>
                              <strong>当前使用默认空配置</strong>
                            </div>
                          )}
                        </div>

                        <div className="storage-meta">
                          <span>最后测试：{formatDateTime(provider.last_test_at)}</span>
                          <span>最后更新：{formatDateTime(provider.updated_at)}</span>
                        </div>

                        {provider.last_test_message ? (
                          <div
                            className={`storage-test-note ${
                              provider.last_test_status === 'success'
                                ? 'storage-test-note-success'
                                : 'storage-test-note-default'
                            }`}
                          >
                            {provider.last_test_message}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="storage-section">
              <div className="storage-section-header">
                <div>
                  <h4>可添加通道</h4>
                  <p>支持本地、S3、腾讯云 COS、FTP 四种接入方式。</p>
                </div>
              </div>

              {availableStorageProviders.length === 0 ? (
                <EmptyState title="可添加通道已全部配置" description="如需重新配置，可直接编辑上方已有通道。" />
              ) : (
                <div className="storage-pool">
                  {availableStorageProviders.map((provider) => {
                    const providerDefinition = storageProviderDefinitions[provider];

                    return (
                      <article className={`storage-add-card storage-add-card-${provider}`} key={provider}>
                        <div className="storage-add-main">
                          <div className={`storage-provider-mark storage-provider-mark-${provider}`}>
                            {getStorageProviderMark(provider)}
                          </div>
                          <div>
                            <strong>{providerDefinition.label}</strong>
                            <p>{providerDefinition.description}</p>
                          </div>
                        </div>
                        <button
                          className="button button-secondary button-small"
                          onClick={() => openStorageEditor(provider)}
                          type="button"
                        >
                          添加通道
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </Panel>
      ) : null}

      {notificationOnly && !loading && tab === 'notifications' ? (
        <Panel
          title="通知发布"
          subtitle={`已发布 ${publishedNotificationCount} 条，当前共 ${notifications.length} 条通知`}
          actions={
            notificationOnly ? null : (
              <button className="button button-primary" onClick={() => openNotificationEditor()} type="button">
                发布通知
              </button>
            )
          }
        >
          <div className="page-stack">
            <Banner tone="info">这里发布的通知会直接显示在“我的 &gt; 消息通知”和首页站内通知入口中。</Banner>

            {notifications.length === 0 ? (
              <EmptyState title="还没有站内通知" description="点击右上角“发布通知”创建第一条通知。" />
            ) : (
              <div className="admin-notification-list">
                {notifications.map((item) => {
                  const toneMeta = getNotificationToneBadge(item.tone);
                  const statusMeta = getNotificationStatusBadge(item.status);

                  return (
                    <article className="admin-notification-card" key={item.notification_id}>
                      <div className="admin-notification-head">
                        <div className="admin-notification-copy">
                          <strong>{item.title}</strong>
                          <div className="admin-notification-badges">
                            <Badge tone={toneMeta.tone}>{toneMeta.label}</Badge>
                            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                          </div>
                        </div>
                        <div className="admin-notification-actions">
                          <button
                            className="button button-secondary button-small"
                            onClick={() => openNotificationEditor(item)}
                            type="button"
                          >
                            编辑
                          </button>
                          {item.status === 'published' ? (
                            <button
                              className="button button-ghost button-small"
                              disabled={submitting}
                              onClick={() => void updateNotificationStatus(item, 'disabled')}
                              type="button"
                            >
                              停用
                            </button>
                          ) : (
                            <button
                              className="button button-primary button-small"
                              disabled={submitting}
                              onClick={() => void updateNotificationStatus(item, 'published')}
                              type="button"
                            >
                              发布
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="admin-notification-content">{item.content}</p>

                      <div className="admin-notification-meta">
                        <span>发布时间：{formatDateTime(item.published_at)}</span>
                        <span>最后更新：{formatDateTime(item.updated_at)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      ) : null}

      <Modal
        open={storageModalOpen && Boolean(storageEditor)}
        title={storageEditor ? `${storageProviderDefinitions[storageEditor.provider].label}配置` : '存储配置'}
        onClose={closeStorageEditor}
        width="large"
      >
        {storageEditor ? (
          <div className="page-stack">
            <div className="dialog-section-title">
              <strong>通道配置</strong>
              <span>编辑完成后先暂存，再回到列表页统一保存存储配置</span>
            </div>

            <div className="storage-editor-head">
              <div>
                <strong>{storageProviderDefinitions[storageEditor.provider].label}</strong>
                <p>{storageProviderDefinitions[storageEditor.provider].description}</p>
              </div>
              <label className="checkbox-item">
                <input
                  checked={storageEditor.is_enabled}
                  onChange={(event) =>
                    setStorageEditor((current) =>
                      current
                        ? {
                            ...current,
                            is_enabled: event.target.checked,
                          }
                        : current,
                    )
                  }
                  type="checkbox"
                />
                <span>{storageEditor.is_enabled ? '保存后启用该通道' : '保存后保持关闭'}</span>
              </label>
            </div>

            <div className="storage-form-grid">
              {activeStorageTextFields.map((field) => (
                <label className="field" key={field.key}>
                  <span>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  <input
                    required={field.required}
                    placeholder={field.placeholder}
                    type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                    value={String(storageEditor.config[field.key] ?? '')}
                    onChange={(event) =>
                      updateStorageEditorConfig(
                        field.key,
                        field.type === 'number'
                          ? event.target.value === ''
                            ? ''
                            : Number(event.target.value)
                          : event.target.value,
                      )
                    }
                  />
                  {field.hint ? <small>{field.hint}</small> : null}
                </label>
              ))}
            </div>

            {activeStorageToggleFields.length > 0 ? (
              <div className="checkbox-grid">
                {activeStorageToggleFields.map((field) => (
                  <label className="checkbox-item storage-toggle-item" key={field.key}>
                    <input
                      checked={Boolean(storageEditor.config[field.key])}
                      onChange={(event) => updateStorageEditorConfig(field.key, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{field.label}</span>
                    {field.hint ? <small>{field.hint}</small> : null}
                  </label>
                ))}
              </div>
            ) : null}

            <div className="button-row">
              <button className="button button-primary" onClick={applyStorageEditor} type="button">
                暂存通道配置
              </button>
              <button className="button button-ghost" onClick={closeStorageEditor} type="button">
                取消
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={notificationModalOpen}
        title={notificationEditor.notification_id ? '编辑通知' : '发布通知'}
        onClose={closeNotificationEditor}
      >
        <div className="page-stack">
          <label className="field">
            <span>通知标题</span>
            <input
              maxLength={120}
              placeholder="例如：清明节课程安排通知"
              type="text"
              value={notificationEditor.title}
              onChange={(event) =>
                setNotificationEditor((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
            />
          </label>

          <div className="admin-notification-form-grid">
            <label className="field">
              <span>通知类型</span>
              <select
                value={notificationEditor.tone}
                onChange={(event) =>
                  setNotificationEditor((current) => ({
                    ...current,
                    tone: event.target.value as NotificationTone,
                  }))
                }
              >
                <option value="info">普通通知</option>
                <option value="warning">提醒通知</option>
                <option value="success">成功通知</option>
                <option value="vip">会员通知</option>
              </select>
            </label>

            <label className="field">
              <span>发布状态</span>
              <select
                value={notificationEditor.status}
                onChange={(event) =>
                  setNotificationEditor((current) => ({
                    ...current,
                    status: event.target.value as NotificationStatus,
                  }))
                }
              >
                <option value="published">立即发布</option>
                <option value="draft">保存草稿</option>
                <option value="disabled">停用隐藏</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span>通知内容</span>
            <textarea
              maxLength={1000}
              placeholder="请输入要发送给学员的具体通知内容"
              rows={6}
              value={notificationEditor.content}
              onChange={(event) =>
                setNotificationEditor((current) => ({
                  ...current,
                  content: event.target.value,
                }))
              }
            />
            <small>{notificationEditor.content.length}/1000</small>
          </label>

          <div className="button-row">
            <button
              className="button button-primary"
              disabled={submitting || !notificationEditor.title.trim() || !notificationEditor.content.trim()}
              onClick={() => void submitNotificationEditor()}
              type="button"
            >
              {submitting ? '保存中...' : notificationEditor.notification_id ? '保存通知' : '创建通知'}
            </button>
            <button className="button button-ghost" onClick={closeNotificationEditor} type="button">
              取消
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
