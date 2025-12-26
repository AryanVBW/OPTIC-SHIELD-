import { ReactNode } from 'react'
import { AlertCircle, CheckCircle, Info, XCircle, AlertTriangle } from 'lucide-react'

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

interface AlertProps {
  children: ReactNode
  variant?: AlertVariant
  title?: string
  onClose?: () => void
  className?: string
}

const variantConfig: Record<AlertVariant, { 
  bg: string
  border: string
  text: string
  icon: ReactNode 
}> = {
  info: {
    bg: 'bg-blue-900/30',
    border: 'border-blue-700/50',
    text: 'text-blue-300',
    icon: <Info className="w-5 h-5" />,
  },
  success: {
    bg: 'bg-green-900/30',
    border: 'border-green-700/50',
    text: 'text-green-300',
    icon: <CheckCircle className="w-5 h-5" />,
  },
  warning: {
    bg: 'bg-yellow-900/30',
    border: 'border-yellow-700/50',
    text: 'text-yellow-300',
    icon: <AlertTriangle className="w-5 h-5" />,
  },
  error: {
    bg: 'bg-red-900/30',
    border: 'border-red-700/50',
    text: 'text-red-300',
    icon: <XCircle className="w-5 h-5" />,
  },
}

export function Alert({ children, variant = 'info', title, onClose, className = '' }: AlertProps) {
  const config = variantConfig[variant]

  return (
    <div
      className={`
        rounded-lg border p-4 ${config.bg} ${config.border} ${className}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={config.text}>
          {config.icon}
        </div>
        <div className="flex-1">
          {title && (
            <h4 className={`font-semibold mb-1 ${config.text}`}>{title}</h4>
          )}
          <div className={`text-sm ${config.text}`}>
            {children}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={`${config.text} hover:opacity-70 transition-opacity`}
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
