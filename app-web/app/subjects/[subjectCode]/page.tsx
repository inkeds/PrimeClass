'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import { ArrowLeftIcon, ChevronDownIcon } from '@/components/icons';
import { CourseCard, EmptyState, SectionTitle } from '@/components/ui-blocks';
import { readContentFilter, writeContentFilter } from '@/lib/content-filter';
import {
  getGrades,
  getHome,
  getSubjects,
  getSyncCourses,
  getVersions,
  isUnauthorizedError,
} from '@/lib/api';
import type { CourseSummary, GradeItem, VersionItem } from '@/lib/types';
import { getMembershipTone, hasVipMembership } from '@/lib/utils';

const subjectTones = [
  ['#fff1f2', '#e11d48'],
  ['#eff6ff', '#2563eb'],
  ['#f5f3ff', '#7c3aed'],
  ['#fff7ed', '#ea580c'],
  ['#ecfdf5', '#059669'],
] as const;

export default function SubjectPage() {
  const params = useParams<{ subjectCode: string }>();
  const searchParams = useSearchParams();
  const { session, logout } = useAppContext();
  const [subjectName, setSubjectName] = useState(params.subjectCode);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionItem | null>(null);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedGradeName, setSelectedGradeName] = useState('');
  const [courseList, setCourseList] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseLoading, setCourseLoading] = useState(false);
  const [filterReady, setFilterReady] = useState(false);
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [error, setError] = useState('');
  const token = session?.token ?? null;
  const initialVersionCode = searchParams.get('version')?.trim() || '';
  const hasVip = hasVipMembership(session?.membership);
  const vipTone = getMembershipTone(session?.membership);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setLoading(true);
      setError('');

      try {
        const persistedFilter = readContentFilter();
        const [homeData, subjectList, versionList] = await Promise.all([
          getHome(token),
          getSubjects(),
          getVersions({
            subject: params.subjectCode,
            grade: persistedFilter?.grade_code ?? undefined,
          }),
        ]);

        if (!active) {
          return;
        }

        const preferredVersionCode =
          initialVersionCode ||
          persistedFilter?.version_code ||
          homeData.current_version_code ||
          versionList[0]?.version_code ||
          '';
        const resolvedVersion =
          preferredVersionCode
            ? versionList.find((item) => item.version_code === preferredVersionCode) ?? {
                version_code: preferredVersionCode,
                version_name:
                  persistedFilter?.version_name ??
                  homeData.current_version_name ??
                  homeData.current_version ??
                  preferredVersionCode,
              }
            : null;

        setSubjectName(
          subjectList.find((item) => item.subject_code === params.subjectCode)?.subject_name ?? params.subjectCode,
        );
        setVersions(versionList);
        setSelectedVersion(resolvedVersion);
        setSelectedGrade(persistedFilter?.grade_code ?? '');
        setSelectedGradeName(persistedFilter?.grade_name ?? '');
        setFilterReady(true);
      } catch (requestError) {
        if (active) {
          if (isUnauthorizedError(requestError)) {
            logout();
          }

          setError(requestError instanceof Error ? requestError.message : '加载学科页面失败');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [initialVersionCode, logout, params.subjectCode, token]);

  useEffect(() => {
    if (!filterReady) {
      return;
    }

    writeContentFilter({
      version_code: selectedVersion?.version_code ?? null,
      version_name: selectedVersion?.version_name ?? null,
      grade_code: selectedGrade || null,
      grade_name: selectedGradeName || null,
    });
  }, [filterReady, selectedGrade, selectedGradeName, selectedVersion?.version_code, selectedVersion?.version_name]);

  useEffect(() => {
    let active = true;

    async function loadGradeOptions() {
      try {
        const list = await getGrades({
          subject: params.subjectCode,
          version: selectedVersion?.version_code,
        });

        if (!active) {
          return;
        }

        setGrades(list);
        setSelectedGradeName((current) => {
          if (!selectedGrade) {
            return '';
          }

          return list.find((item) => item.grade_code === selectedGrade)?.grade_name ?? current;
        });
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '加载年级筛选失败');
        }
      }
    }

    void loadGradeOptions();

    return () => {
      active = false;
    };
  }, [params.subjectCode, selectedVersion?.version_code]);

  useEffect(() => {
    if (loading) {
      return;
    }

    let active = true;

    async function loadCourses() {
      setCourseLoading(true);
      setError('');

      try {
        const response = await getSyncCourses(
          {
            subject: params.subjectCode,
            grade: selectedGrade || undefined,
            version: selectedVersion?.version_code,
            page_size: 12,
          },
          token,
        );

        if (active) {
          setCourseList(response.list);
        }
      } catch (requestError) {
        if (active) {
          if (isUnauthorizedError(requestError)) {
            logout();
          }

          setError(requestError instanceof Error ? requestError.message : '加载学科课程失败');
        }
      } finally {
        if (active) {
          setCourseLoading(false);
        }
      }
    }

    void loadCourses();

    return () => {
      active = false;
    };
  }, [loading, logout, params.subjectCode, selectedGrade, selectedVersion?.version_code, token]);

  const selectedGradeLabel =
    (grades.find((item) => item.grade_code === selectedGrade)?.grade_name ?? selectedGradeName) || null;
  const topFilterLabel = [selectedVersion?.version_name, selectedGradeLabel].filter(Boolean).join(' · ') || '选择教材版本';
  const subjectToneIndex = useMemo(
    () =>
      Array.from(params.subjectCode).reduce((total, char) => total + char.charCodeAt(0), 0) % subjectTones.length,
    [params.subjectCode],
  );
  const [subjectBackground, subjectColor] = subjectTones[subjectToneIndex];
  const heroStyle = {
    '--subject-bg': subjectBackground,
    '--subject-color': subjectColor,
  } as CSSProperties;

  return (
    <AppShell>
      <div className="page-scroll topic-page">
        <header className="subject-detail-header">
          <div className="subject-detail-header__bar">
            <Link href="/" className="back-button">
              <ArrowLeftIcon className="back-button__icon" />
            </Link>
            <button type="button" className="version-trigger" onClick={() => setVersionPickerOpen(true)}>
              <span>{topFilterLabel}</span>
              <ChevronDownIcon className="version-trigger__icon" />
            </button>
          </div>

          <section className="subject-detail-hero" style={heroStyle}>
            <div className="subject-detail-hero__icon">{subjectName.slice(0, 1)}</div>
            <div className="subject-detail-hero__copy">
              <small>{topFilterLabel}</small>
              <h1>{subjectName}同步课</h1>
            </div>
          </section>
        </header>

        <main className="page-body page-body--topics">
          {error ? <div className="search-empty-tip is-warning">{error}</div> : null}

          <section>
            <SectionTitle title={`${subjectName}课程`} />
            {loading || courseLoading ? (
              <div className="course-list">
                <div className="skeleton-card" />
                <div className="skeleton-card" />
              </div>
            ) : courseList.length > 0 ? (
              <div className="course-list">
                {courseList.map((course) => (
                  <CourseCard key={course.course_id} course={course} hasVip={hasVip} vipTone={vipTone} />
                ))}
              </div>
            ) : (
              <EmptyState title={`暂无${subjectName}课程`} description="切换年级或教材版本后再试试看。" />
            )}
          </section>
        </main>

        {versionPickerOpen ? (
          <div className="modal-backdrop" onClick={() => setVersionPickerOpen(false)}>
            <div className="version-modal" onClick={(event) => event.stopPropagation()}>
              <h3>选择教材版本和年级</h3>

              <div className="version-modal__group">
                <div className="version-modal__label">教材版本</div>
                <div className="version-modal__list">
                  <button
                    type="button"
                    className={`filter-pill${selectedVersion === null ? ' is-active' : ''}`}
                    onClick={() => {
                      setSelectedVersion(null);
                    }}
                  >
                    不限版本
                  </button>
                  {versions.map((version) => (
                    <button
                      key={version.version_code}
                      type="button"
                      className={`filter-pill${selectedVersion?.version_code === version.version_code ? ' is-active' : ''}`}
                      onClick={() => {
                        setSelectedVersion(version);
                      }}
                    >
                      {version.version_name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="version-modal__group">
                <div className="version-modal__label">年级</div>
                <div className="version-modal__list">
                  <button
                    type="button"
                    className={`filter-pill${selectedGrade === '' ? ' is-active' : ''}`}
                    onClick={() => {
                      setSelectedGrade('');
                      setSelectedGradeName('');
                    }}
                  >
                    全部年级
                  </button>
                  {grades.map((grade) => (
                    <button
                      key={grade.grade_code}
                      type="button"
                      className={`filter-pill${selectedGrade === grade.grade_code ? ' is-active' : ''}`}
                      onClick={() => {
                        if (selectedGrade === grade.grade_code) {
                          setSelectedGrade('');
                          setSelectedGradeName('');
                          return;
                        }

                        setSelectedGrade(grade.grade_code);
                        setSelectedGradeName(grade.grade_name);
                      }}
                    >
                      {grade.grade_name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="version-modal__footer">
                <button type="button" className="primary-button primary-button--inline" onClick={() => setVersionPickerOpen(false)}>
                  完成
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
