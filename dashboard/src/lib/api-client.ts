type RequestConfig = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  headers?: Record<string, string>
  timeout?: number
  retries?: number
  retryDelay?: number
}

type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
}

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ApiClient {
  private baseUrl: string
  private defaultTimeout: number = 10000
  private maxRetries: number = 3
  private retryDelay: number = 1000

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Request timeout', 408)
      }
      throw error
    }
  }

  private async executeRequest<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const {
      method = 'GET',
      body,
      headers = {},
      timeout = this.defaultTimeout,
      retries = this.maxRetries,
      retryDelay = this.retryDelay,
    } = config

    const url = `${this.baseUrl}${endpoint}`
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(retryDelay * Math.pow(2, attempt - 1))
        }

        const response = await this.fetchWithTimeout(url, options, timeout)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new ApiError(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            errorData
          )
        }

        const data = await response.json()
        return data as T
      } catch (error) {
        lastError = error as Error

        if (error instanceof ApiError && error.statusCode) {
          if (error.statusCode >= 400 && error.statusCode < 500) {
            throw error
          }
        }

        if (attempt === retries) {
          throw error
        }

        console.warn(`Request attempt ${attempt + 1} failed, retrying...`, error)
      }
    }

    throw lastError || new ApiError('Request failed after all retries')
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.executeRequest<T>(endpoint, { ...config, method: 'GET' })
  }

  async post<T>(endpoint: string, body?: any, config?: RequestConfig): Promise<T> {
    return this.executeRequest<T>(endpoint, { ...config, method: 'POST', body })
  }

  async put<T>(endpoint: string, body?: any, config?: RequestConfig): Promise<T> {
    return this.executeRequest<T>(endpoint, { ...config, method: 'PUT', body })
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.executeRequest<T>(endpoint, { ...config, method: 'DELETE' })
  }
}

export const apiClient = new ApiClient()
