/**
 * Lightweight Vercel API client for the Vercel Dashboard Widget plugin.
 * Replaces the heavy @vercel/sdk dependency with direct API calls.
 */

// API Response Types
export interface VercelDeployment {
  created: number
  id: string
  inspectorUrl: null | string
  name: string
  ready?: number
  state: 'BUILDING' | 'CANCELED' | 'DELETED' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY'
  status: 'BUILDING' | 'CANCELED' | 'DELETED' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY'
  uid: string
}

export interface VercelDeploymentsResponse {
  deployments: VercelDeployment[]
  pagination: {
    count: number
    next?: number
    prev?: number
  }
}

export interface VercelProject {
  id: string
  link?: {
    org: string
    productionBranch: string
    repo: string
    type: 'github'
  }
  name: string
}

export interface CreateDeploymentRequest {
  gitSource: {
    org: string
    ref: string
    repo: string
    type: 'github'
  }
  meta?: {
    githubCommitAuthorLogin?: string
  }
  name: string
  project: string
  projectSettings?: {
    commandForIgnoringBuildStep?: string
  }
  target: 'preview' | 'production'
}

export interface CreateDeploymentResponse {
  created: number
  id: string
  name: string
  status: string
  uid: string
}

/**
 * Lightweight Vercel API client
 */
export class VercelApiClient {
  private readonly baseUrl = 'https://api.vercel.com'
  private readonly bearerToken: string

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken
  }

  private async request<T>(
    endpoint: string,
    options: {
      body?: unknown
      method?: 'DELETE' | 'GET' | 'POST' | 'PUT'
      searchParams?: Record<string, string>
    } = {},
  ): Promise<T> {
    const { body, method = 'GET', searchParams } = options

    let url = `${this.baseUrl}${endpoint}`

    if (searchParams) {
      const params = new URLSearchParams(searchParams)
      url += `?${params.toString()}`
    }

    const response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
      method,
    })

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Create a new deployment
   */
  async createDeployment(params: {
    requestBody: CreateDeploymentRequest
    teamId?: string
  }): Promise<CreateDeploymentResponse> {
    const searchParams: Record<string, string> = {}

    if (params.teamId) {
      searchParams.teamId = params.teamId
    }

    return this.request<CreateDeploymentResponse>('/v13/deployments', {
      body: params.requestBody,
      method: 'POST',
      searchParams,
    })
  }

  /**
   * Get a specific deployment by ID
   */
  async getDeployment(params: { idOrUrl: string; teamId?: string }): Promise<VercelDeployment> {
    const searchParams: Record<string, string> = {}

    if (params.teamId) {
      searchParams.teamId = params.teamId
    }

    return this.request<VercelDeployment>(`/v13/deployments/${params.idOrUrl}`, {
      searchParams,
    })
  }

  /**
   * Get deployments for a project
   */
  async getDeployments(params: {
    limit?: number
    projectId: string
    target?: 'preview' | 'production'
    teamId?: string
  }): Promise<VercelDeploymentsResponse> {
    const searchParams: Record<string, string> = {
      projectId: params.projectId,
    }

    if (params.teamId) {
      searchParams.teamId = params.teamId
    }
    if (params.target) {
      searchParams.target = params.target
    }
    if (params.limit) {
      searchParams.limit = params.limit.toString()
    }

    return this.request<VercelDeploymentsResponse>('/v6/deployments', {
      searchParams,
    })
  }

  /**
   * Get project details by ID
   */
  async getProject(params: { projectId: string; teamId?: string }): Promise<VercelProject> {
    const searchParams: Record<string, string> = {}

    if (params.teamId) {
      searchParams.teamId = params.teamId
    }

    return this.request<VercelProject>(`/v9/projects/${params.projectId}`, {
      searchParams,
    })
  }
}
