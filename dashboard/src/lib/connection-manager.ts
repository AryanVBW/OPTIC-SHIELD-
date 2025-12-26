type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

type ConnectionListener = (status: ConnectionStatus) => void

export class ConnectionManager {
  private status: ConnectionStatus = 'disconnected'
  private listeners: Set<ConnectionListener> = new Set()
  private healthCheckInterval: NodeJS.Timeout | null = null
  private reconnectTimeout: NodeJS.Timeout | null = null
  private healthCheckUrl: string
  private checkInterval: number
  private reconnectDelay: number
  private maxReconnectDelay: number = 30000
  private currentReconnectDelay: number
  private consecutiveFailures: number = 0

  constructor(
    healthCheckUrl: string = '/api/health',
    checkInterval: number = 5000,
    reconnectDelay: number = 2000
  ) {
    this.healthCheckUrl = healthCheckUrl
    this.checkInterval = checkInterval
    this.reconnectDelay = reconnectDelay
    this.currentReconnectDelay = reconnectDelay
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status
      this.notifyListeners()
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.status))
  }

  public onStatusChange(listener: ConnectionListener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    
    return () => {
      this.listeners.delete(listener)
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status
  }

  private async performHealthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(this.healthCheckUrl, {
        signal: controller.signal,
        cache: 'no-store',
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      return false
    }
  }

  private async checkConnection(): Promise<void> {
    const isHealthy = await this.performHealthCheck()

    if (isHealthy) {
      this.consecutiveFailures = 0
      this.currentReconnectDelay = this.reconnectDelay
      
      if (this.status !== 'connected') {
        this.setStatus('connected')
      }
    } else {
      this.consecutiveFailures++
      
      if (this.status === 'connected') {
        this.setStatus('error')
        this.scheduleReconnect()
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.setStatus('connecting')

    this.reconnectTimeout = setTimeout(async () => {
      const isHealthy = await this.performHealthCheck()
      
      if (isHealthy) {
        this.consecutiveFailures = 0
        this.currentReconnectDelay = this.reconnectDelay
        this.setStatus('connected')
        this.startHealthCheck()
      } else {
        this.currentReconnectDelay = Math.min(
          this.currentReconnectDelay * 2,
          this.maxReconnectDelay
        )
        this.scheduleReconnect()
      }
    }, this.currentReconnectDelay)
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(() => {
      this.checkConnection()
    }, this.checkInterval)
  }

  public async start(): Promise<void> {
    this.setStatus('connecting')
    
    const isHealthy = await this.performHealthCheck()
    
    if (isHealthy) {
      this.setStatus('connected')
      this.startHealthCheck()
    } else {
      this.setStatus('error')
      this.scheduleReconnect()
    }
  }

  public stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.setStatus('disconnected')
    this.listeners.clear()
  }

  public async forceReconnect(): Promise<void> {
    this.stop()
    await this.start()
  }
}

export const connectionManager = new ConnectionManager()
