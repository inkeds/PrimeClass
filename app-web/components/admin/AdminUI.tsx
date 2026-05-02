import type { ButtonHTMLAttributes, ReactNode, SVGProps } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

type PanelProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

type BadgeProps = {
  tone?: 'blue' | 'green' | 'gold' | 'red' | 'slate' | 'violet';
  children: ReactNode;
};

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: 'medium' | 'large';
};

type TabsProps<T extends string> = {
  value: T;
  items: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  variant?: 'default' | 'button';
};

type ActionIcon = 'edit' | 'delete' | 'view' | 'toggle' | 'open' | 'lock' | 'up' | 'down';

type ActionIconButtonProps = {
  label: string;
  icon: ActionIcon;
  tone?: 'default' | 'danger' | 'soft';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

function ActionGlyph({ icon, ...props }: { icon: ActionIcon } & SVGProps<SVGSVGElement>) {
  switch (icon) {
    case 'edit':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="m4 16.5 9.6-9.6 3.5 3.5-9.6 9.6L4 20Z" />
          <path d="m12.5 7.5 3.5 3.5" />
        </svg>
      );
    case 'delete':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="M8 7l1 11h6l1-11" />
          <path d="M10 10.5v4.5" />
          <path d="M14 10.5v4.5" />
        </svg>
      );
    case 'view':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
          <path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        </svg>
      );
    case 'toggle':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M7 7h10v10H7z" />
          <path d="M9 12h6" />
        </svg>
      );
    case 'open':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M14 5h5v5" />
          <path d="M10 14 19 5" />
          <path d="M19 13v5H5V5h5" />
        </svg>
      );
    case 'lock':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M7.5 10V7.8a4.5 4.5 0 1 1 9 0V10" />
          <path d="M6 10h12v9H6z" />
          <path d="M12 13v3" />
        </svg>
      );
    case 'up':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M12 19V6" />
          <path d="m7 11 5-5 5 5" />
        </svg>
      );
    case 'down':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
          <path d="M12 5v13" />
          <path d="m17 13-5 5-5-5" />
        </svg>
      );
  }
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <section className="page-header">
      <div>
        <div className="eyebrow">运营后台</div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </section>
  );
}

export function Panel({ title, subtitle, actions, children }: PanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Badge({ tone = 'slate', children }: BadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}

export function Tabs<T extends string>({
  value,
  items,
  onChange,
  variant = 'default',
}: TabsProps<T>) {
  return (
    <div className={`tabs${variant === 'button' ? ' tabs-button' : ''}`}>
      {items.map((item) => (
        <button
          key={item.value}
          className={`tab-chip${item.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(item.value)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, title, children, onClose, width = 'medium' }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className={`dialog dialog-${width}`} onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

export function ActionIconButton({
  label,
  icon,
  tone = 'default',
  className = '',
  type = 'button',
  ...props
}: ActionIconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`icon-action icon-action-${tone}${className ? ` ${className}` : ''}`}
      title={label}
      type={type}
      {...props}
    >
      <ActionGlyph icon={icon} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function LoadingBlock({ text = '加载中…' }: { text?: string }) {
  return <div className="loading-block">{text}</div>;
}
