import type { Icon as PhosphorIcon } from '@phosphor-icons/react'

interface WorkspaceInsightCardProps {
  label: string
  value: string | number
  icon: PhosphorIcon
  caption?: string
}

export default function WorkspaceInsightCard({ label, value, icon: Icon, caption }: WorkspaceInsightCardProps) {
  return (
    <div className="admin-insight-card workspace-insight-card">
      <div className="admin-insight-card__heading">
        <span className="admin-insight-card__icon"><Icon aria-hidden="true" className="h-4 w-4" /></span>
        <p className="admin-insight-card__label">{label}</p>
      </div>
      <p className="admin-insight-card__value">{value}</p>
      {caption && <p className="admin-insight-card__caption">{caption}</p>}
    </div>
  )
}
