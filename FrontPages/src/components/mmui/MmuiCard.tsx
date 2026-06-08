import React from 'react';

interface MmuiCardProps {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bodyClassName?: string;
}

/** MMUI 风格卡片组件 */
export default function MmuiCard({
  title, extra, children, className = '', style, bodyClassName = ''
}: MmuiCardProps) {
  return (
    <div className={`mmui-card ${className}`} style={style}>
      {(title || extra) && (
        <div className="mmui-card__header">
          <span className="mmui-card__title">{title}</span>
          {extra && <span className="mmui-card__extra">{extra}</span>}
        </div>
      )}
      <div className={`mmui-card__body ${bodyClassName}`}>{children}</div>
    </div>
  );
}

/** MMUI 风格环形仪表盘 */
export function MmuiGaugeRing({ percent, color, size = 100, label, subLabel }: {
  percent: number; color: string; size?: number; label: string; subLabel?: string;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;

  return (
    <div className="mmui-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--mmui-power-ring-bg)" strokeWidth="8"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central"
          fill="var(--mmui-heading)" fontSize={size * 0.22} fontWeight="700">
          {percent > 999 ? `${(percent / 1000).toFixed(0)}k` : Math.round(percent)}
        </text>
        {percent <= 100 && (
          <text x="50%" y="68%" textAnchor="middle" dominantBaseline="central"
            fill="var(--mmui-text-muted)" fontSize={size * 0.11}>%</text>
        )}
      </svg>
      <div className="mmui-gauge__labels">
        <div className="mmui-gauge__label" style={{ color }}>{label}</div>
        {subLabel && <div className="mmui-gauge__sublabel">{subLabel}</div>}
      </div>
    </div>
  );
}

/** MMUI 风格快捷统计卡片 */
export function MmuiStatCard({ icon, title, count, total, color, onClick }: {
  icon: React.ReactNode; title: string; count: number; total: number;
  color: string; onClick?: () => void;
}) {
  const percent = total > 0 ? Math.round(count / total * 100) : 0;

  return (
    <div className="mmui-stat-card" onClick={onClick} style={{ '--stat-color': color } as React.CSSProperties}>
      <div className="mmui-stat-card__header">
        <div className="mmui-stat-card__icon-wrap">
          <span className="mmui-stat-card__icon">{icon}</span>
          <span className="mmui-stat-card__title">{title}</span>
        </div>
      </div>
      <div className="mmui-stat-card__value">
        <span className="mmui-stat-card__label">数量: </span>
        <span className="mmui-stat-card__count">{count}/{total}</span>
      </div>
      <div className="mmui-stat-card__bar">
        <div className="mmui-stat-card__bar-fill" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

/** MMUI 风格登录方式卡片 */
export function MmuiLoginCard({ icon, title, badge, desc, buttonText, onClick, disabled }: {
  icon: React.ReactNode; title: string; badge?: { text: string; color: string };
  desc: string; buttonText: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <div className="mmui-login-card">
      <div className="mmui-login-card__header">
        <span className="mmui-login-card__icon">{icon}</span>
        <span className="mmui-login-card__title">{title}</span>
        {badge && (
          <span className="mmui-login-card__badge" style={{
            background: badge.color + '20', color: badge.color
          }}>{badge.text}</span>
        )}
      </div>
      <p className="mmui-login-card__desc">{desc}</p>
      <button
        className={`mmui-page-btn ${badge?.text === '推荐' ? 'mmui-page-btn--primary' : ''} mmui-page-btn--block`}
        onClick={onClick}
        disabled={disabled}
      >
        {buttonText}
      </button>
    </div>
  );
}
