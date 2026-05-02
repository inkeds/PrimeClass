'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Badge, Banner, LoadingBlock, PageHeader } from '@/components/admin/AdminUI';
import { apiRequest, type ListPayload } from '@/components/admin/lib/api';
import { formatDateTime, formatNumber } from '@/components/admin/lib/format';
import { getErrorMessage } from '@/components/admin/shared';

type Overview = {
  user_total: number;
  active_user_today: number;
  course_total: number;
  published_course_total: number;
  vip_active_total: number;
  redeem_today_total: number;
};

type TodoItem = {
  code: string;
  title: string;
  count: number;
};

type DashboardCourse = {
  course_id: string;
  title: string;
  teacher_name: string | null;
  status: string;
  updated_at: string;
  course_type: string;
};

type DashboardHeatCourse = {
  course_id: string;
  grade_code: string | null;
  version_code: string | null;
  status: string;
};

type DictionaryItem = {
  id: string;
  item_code: string;
  item_name: string;
};

type DashboardUser = {
  user_id: string;
  nickname: string;
  membership_status: string;
  created_at: string;
  last_active_at: string | null;
};

type MetricTone = 'blue' | 'violet' | 'orange' | 'green';
type HeatMode = 'grade' | 'version';

const toneClassMap: Record<MetricTone, string> = {
  blue: 'is-blue',
  violet: 'is-violet',
  orange: 'is-orange',
  green: 'is-green',
};

export function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [latestCourses, setLatestCourses] = useState<DashboardCourse[]>([]);
  const [latestUsers, setLatestUsers] = useState<DashboardUser[]>([]);
  const [heatMode, setHeatMode] = useState<HeatMode>('grade');
  const [heatCourses, setHeatCourses] = useState<DashboardHeatCourse[]>([]);
  const [gradeLabels, setGradeLabels] = useState<Map<string, string>>(new Map());
  const [versionLabels, setVersionLabels] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [overviewData, todoData, courseData, userData, heatCourseData, gradeData, versionData] = await Promise.all([
          apiRequest<Overview>('/dashboard/overview'),
          apiRequest<{ list: TodoItem[]; pagination: { total: number } }>('/dashboard/todos'),
          apiRequest<ListPayload<DashboardCourse>>('/courses?page=1&page_size=2'),
          apiRequest<ListPayload<DashboardUser>>('/users?page=1&page_size=4'),
          apiRequest<ListPayload<DashboardHeatCourse>>('/courses?page=1&page_size=100'),
          apiRequest<ListPayload<DictionaryItem>>('/dictionaries?type=grade'),
          apiRequest<ListPayload<DictionaryItem>>('/dictionaries?type=version'),
        ]);

        if (cancelled) {
          return;
        }

        setOverview(overviewData);
        setTodos(todoData.list);
        setLatestCourses(courseData.list);
        setLatestUsers(userData.list);
        setHeatCourses(heatCourseData.list);
        setGradeLabels(new Map(gradeData.list.map((item) => [item.item_code, item.item_name])));
        setVersionLabels(new Map(versionData.list.map((item) => [item.item_code, item.item_name])));
      } catch (requestError) {
        if (!cancelled) {
          setError(getErrorMessage(requestError));
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const headlineCards = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      {
        label: '累计学员',
        value: formatNumber(overview.user_total),
        hint: '课程体系持续扩容',
        tone: 'blue' as const,
      },
      {
        label: '在线课程',
        value: formatNumber(overview.published_course_total),
        hint: `总课程 ${formatNumber(overview.course_total)} 门`,
        tone: 'violet' as const,
      },
      {
        label: '今日新增会员',
        value: formatNumber(overview.redeem_today_total),
        hint: `有效会员 ${formatNumber(overview.vip_active_total)} 人`,
        tone: 'orange' as const,
      },
      {
        label: '今日活跃',
        value: formatNumber(overview.active_user_today),
        hint: '学习行为持续发生',
        tone: 'green' as const,
      },
    ];
  }, [overview]);
  const heatItems = useMemo(() => {
    const labelMap = heatMode === 'grade' ? gradeLabels : versionLabels;
    const counts = new Map<string, number>();

    heatCourses
      .filter((course) => course.status === 'published')
      .forEach((course) => {
        const code = heatMode === 'grade' ? course.grade_code : course.version_code;

        if (!code) {
          return;
        }

        counts.set(code, (counts.get(code) || 0) + 1);
      });

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([code, value], index) => ({
        code,
        label: labelMap.get(code) || code,
        value,
        tone: (['blue', 'orange', 'violet', 'green', 'blue', 'violet'] as const)[index % 6],
      }));
  }, [gradeLabels, heatCourses, heatMode, versionLabels]);

  const heatMax = Math.max(...heatItems.map((item) => item.value), 1);

  return (
    <div className="page-stack">
      <PageHeader title="工作台" />

      {error ? <Banner tone="error">{error}</Banner> : null}

      {!overview ? (
        <LoadingBlock text="正在加载工作台数据…" />
      ) : (
        <>
          <section className="dashboard-metric-row">
            {headlineCards.map((item) => (
              <article className={`dashboard-metric-card ${toneClassMap[item.tone]}`} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.hint}</p>
                <div className="dashboard-metric-icon" aria-hidden="true" />
              </article>
            ))}
          </section>

          <section className="dashboard-reference-grid">
            <section className="dashboard-reference-panel dashboard-chart-panel">
              <div className="dashboard-panel-head">
                <div>
                  <h3>年级 / 教材版本热度</h3>
                  <p>按已上架课程数量观察当前内容分布，便于判断主推年级与教材版本。</p>
                </div>
                <div className="dashboard-chip-row">
                  <button
                    className={`dashboard-chip${heatMode === 'grade' ? ' is-active' : ''}`}
                    onClick={() => setHeatMode('grade')}
                    type="button"
                  >
                    年级热度
                  </button>
                  <button
                    className={`dashboard-chip${heatMode === 'version' ? ' is-active' : ''}`}
                    onClick={() => setHeatMode('version')}
                    type="button"
                  >
                    教材版本
                  </button>
                </div>
              </div>

              {heatItems.length === 0 ? (
                <div className="dashboard-inline-empty">暂无可用于分析的课程热度数据</div>
              ) : (
                <div className="dashboard-chart-surface">
                  <div className="dashboard-chart-grid" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="dashboard-chart-columns">
                    {heatItems.map((item) => (
                      <div className="dashboard-chart-column" key={item.code}>
                        <strong className="dashboard-chart-value">{formatNumber(item.value)}</strong>
                        <div
                          className={`dashboard-chart-bar ${toneClassMap[item.tone]}`}
                          style={{ height: `${Math.max(18, Math.round((item.value / heatMax) * 220))}px` }}
                        />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="dashboard-reference-panel dashboard-side-list">
              <div className="dashboard-panel-head">
                <div>
                  <h3>最新同步课程上线</h3>
                  <p>按课程数据流展示最近可管理内容。</p>
                </div>
              </div>

              <div className="dashboard-course-list">
                {latestCourses.length === 0 ? (
                  <div className="dashboard-inline-empty">暂无课程数据</div>
                ) : (
                  latestCourses.map((course, index) => (
                    <div className="dashboard-course-item" key={course.course_id}>
                      <div className={`dashboard-course-badge ${index === 0 ? 'is-blue' : 'is-orange'}`}>
                        {course.course_type === 'topic' ? 'A' : '√'}
                      </div>
                      <div className="dashboard-course-copy">
                        <strong>{course.title}</strong>
                        <span>{course.teacher_name || '未填写讲师'} · {course.course_type === 'topic' ? '专题课' : '同步课'}</span>
                        <Badge tone={course.status === 'published' ? 'green' : 'blue'}>
                          {course.status === 'published' ? '已发布' : '同步中'}
                        </Badge>
                      </div>
                      <time>{formatDateTime(course.updated_at).slice(0, 10)}</time>
                    </div>
                  ))
                )}
              </div>

              <Link className="dashboard-block-link" href="/admin/courses">
                课程库全局管理
              </Link>
            </section>

            <section className="dashboard-reference-panel dashboard-user-list-panel">
              <div className="dashboard-panel-head">
                <div>
                  <h3>近期活跃会员学员</h3>
                  <p>结合最近活跃与会员状态展示当前重点用户。</p>
                </div>
              </div>

              <div className="dashboard-user-list">
                {latestUsers.length === 0 ? (
                  <div className="dashboard-inline-empty">暂无学员数据</div>
                ) : (
                  latestUsers.map((user, index) => (
                    <div className="dashboard-user-item" key={user.user_id}>
                      <div className={`dashboard-user-avatar dashboard-user-avatar-${index % 4}`}>
                        {user.nickname.slice(0, 1)}
                      </div>
                      <div className="dashboard-user-copy">
                        <div className="dashboard-user-title">
                          <strong>{user.nickname}</strong>
                          {(user.membership_status === 'active' || user.membership_status === 'permanent') ? (
                            <span className="dashboard-user-vip">VIP</span>
                          ) : null}
                        </div>
                        <span>
                          最近活跃 {formatDateTime(user.last_active_at || user.created_at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="dashboard-reference-panel dashboard-rank-panel">
              <div className="dashboard-panel-head">
                <div>
                  <h3>活跃学员实时榜</h3>
                  <p>用于快速识别近期持续活跃的重点学员。</p>
                </div>
              </div>

              <div className="dashboard-rank-list">
                {(latestUsers.length === 0 ? todos.slice(0, 3).map((item) => ({
                  key: item.code,
                  label: item.title,
                  meta: `${formatNumber(item.count)} 条`,
                })) : latestUsers.slice(0, 3).map((user) => ({
                  key: user.user_id,
                  label: user.nickname,
                  meta: formatDateTime(user.last_active_at || user.created_at).slice(5, 16),
                }))).map((item, index) => (
                  <div className="dashboard-rank-item" key={item.key}>
                    <span className="dashboard-rank-index">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{item.label}</strong>
                    <span className="dashboard-rank-meta">{item.meta}</span>
                  </div>
                ))}
              </div>
            </section>
          </section>
        </>
      )}
    </div>
  );
}
