'use client';

import type { FormEvent } from 'react';
import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import { CrownIcon } from '@/components/icons';
import { loginApp } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mounted, session, setSession, showToast } = useAppContext();
  const [account, setAccount] = useState('student_demo');
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const redirect = searchParams.get('redirect') || '/';

  useEffect(() => {
    if (mounted && session?.token) {
      router.replace(redirect);
    }
  }, [mounted, redirect, router, session?.token]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      try {
        const loginData = await loginApp({
          account,
          password,
        });

        setSession(loginData);
        showToast('登录成功');
        router.replace(redirect);
      } catch (error) {
        showToast(error instanceof Error ? error.message : '登录失败', 'error');
      }
    });
  }

  return (
    <AppShell showNav={false}>
      <div className="page-scroll auth-page">
        <section className="auth-hero">
          <div className="auth-hero__badge">
            <CrownIcon className="auth-hero__badge-icon" />
            <span>优学课堂</span>
          </div>
          <h1>同步课 + 专题课 + 会员权益，一个前台全部承接</h1>
          <p>前台基于 Next.js 16，样式按 demo.html 的移动端布局重构，直接对接现有 Node.js API。</p>
        </section>

        <section className="auth-card">
          <div className="auth-card__demo">
            <strong>请输入你本地初始化后的体验账号</strong>
            <span>默认示例用户名通常为 student_demo，密码由本地初始化决定</span>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">账号</span>
              <div className="field__input">
                <input value={account} onChange={(event) => setAccount(event.target.value)} placeholder="请输入账号或手机号" />
              </div>
            </label>
            <label className="field">
              <span className="field__label">密码</span>
              <div className="field__input">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入登录密码"
                />
              </div>
            </label>
            <button type="submit" className="primary-button" disabled={pending}>
              {pending ? '登录中...' : '登录并进入学习端'}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
