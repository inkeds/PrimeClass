'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';

import { getErrorMessage } from '@/components/admin/shared';

type LoginPageProps = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await onLogin(username, password);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="login-hero-copy">
          <div className="login-hero-badge">优学课堂 · 管理后台</div>
          <h1>课程、学员、会员与系统配置统一进入一个后台</h1>
          <p>
            当前后台已经联通本地 MySQL、课程管理、激活码体系和系统设置。登录后可以直接继续联调、
            验收和录入业务数据。
          </p>
        </div>

        <div className="hero-grid">
          <div className="hero-card">
            <span className="hero-kicker">课程中台</span>
            <strong>同步课 / 专题课 / 章节 / 资源</strong>
            <p>支持课程录入、资源维护和专题标签整理。</p>
          </div>
          <div className="hero-card">
            <span className="hero-kicker">会员体系</span>
            <strong>套餐 / 激活码 / 兑换记录 / 补偿</strong>
            <p>激活码批次和兑换链路已经闭环。</p>
          </div>
          <div className="hero-card">
            <span className="hero-kicker">用户体系</span>
            <strong>档案 / 学习记录 / 备注 / 状态</strong>
            <p>学员后台可直接查看状态和学习记录。</p>
          </div>
          <div className="hero-card">
            <span className="hero-kicker">系统设置</span>
            <strong>本地 / S3 / 腾讯云 / FTP</strong>
            <p>四种存储方案可在后台统一维护。</p>
          </div>
        </div>

        <div className="login-hero-footer">
          <div className="login-hero-meta">
            <span>默认环境</span>
            <strong>本地 MySQL 已接入</strong>
          </div>
          <div className="login-hero-meta">
            <span>联调范围</span>
            <strong>前后台统一样式中</strong>
          </div>
        </div>
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-card-head">
          <div className="eyebrow">Sign In</div>
          <h2>登录后台</h2>
          <p>使用管理员账号进入课程运营控制台。</p>
        </div>

        <label className="field">
          <span>管理员账号</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>

        <label className="field">
          <span>登录密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <div className="banner banner-error">{error}</div> : null}

        <button className="button button-primary button-full" disabled={submitting} type="submit">
          {submitting ? '登录中…' : '进入后台'}
        </button>

        <div className="login-tips">
          <div>默认管理员用户名：admin</div>
          <div>密码由本地初始化脚本或手工导入后自行设置</div>
          <div>登录后可直接进入新后台桌面布局</div>
        </div>
      </form>
    </div>
  );
}
