import { MCPServerConfig } from './mcp-client'

// Registry of known MCP servers
export const MCP_SERVER_REGISTRY: Record<string, MCPServerConfig> = {
  'supabase-local': {
    id: 'supabase-local',
    name: 'Supabase Local',
    description: 'Connect to local Supabase instance for database operations, auth management, and real-time subscriptions',
    endpoint: 'http://localhost:54321/functions/v1/mcp-server/mcp',
    transport: 'http',
    enabled: false,
    tags: ['database', 'supabase', 'auth', 'realtime']
  },
  'supabase-cloud': {
    id: 'supabase-cloud',
    name: 'Supabase Cloud',
    description: 'Connect to Supabase cloud project for production database operations',
    endpoint: 'https://your-project.supabase.co/functions/v1/mcp-server/mcp',
    transport: 'http',
    auth: {
      type: 'bearer',
      token: process.env.SUPABASE_SERVICE_ROLE_KEY
    },
    enabled: false,
    tags: ['database', 'supabase', 'cloud', 'production']
  },
  'postgresql': {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Direct PostgreSQL database operations with raw SQL, query planning, and performance analysis',
    endpoint: 'stdio://postgresql-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['database', 'postgresql', 'sql']
  },
  'docker': {
    id: 'docker',
    name: 'Docker',
    description: 'Container management, image building, and Docker Compose orchestration',
    endpoint: 'stdio://docker-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['containers', 'docker', 'devops']
  },
  'kubernetes': {
    id: 'kubernetes',
    name: 'Kubernetes',
    description: 'Pod management, service deployment, and cluster operations',
    endpoint: 'stdio://k8s-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['containers', 'kubernetes', 'orchestration']
  },
  'aws': {
    id: 'aws',
    name: 'AWS',
    description: 'AWS services including S3, Lambda, RDS, and CloudFormation operations',
    endpoint: 'stdio://aws-mcp',
    transport: 'stdio',
    auth: {
      type: 'api-key',
      apiKey: process.env.AWS_ACCESS_KEY_ID
    },
    enabled: false,
    tags: ['cloud', 'aws', 'infrastructure']
  },
  'firebase': {
    id: 'firebase',
    name: 'Firebase',
    description: 'Firestore, Auth, Functions, and Hosting management',
    endpoint: 'stdio://firebase-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['database', 'firebase', 'auth', 'hosting']
  },
  'openai': {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models, DALL-E image generation, Whisper transcription, and embeddings',
    endpoint: 'stdio://openai-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.OPENAI_API_KEY
    },
    enabled: false,
    tags: ['ai', 'openai', 'gpt', 'dalle', 'whisper']
  },
  'anthropic': {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models and advanced reasoning capabilities',
    endpoint: 'stdio://anthropic-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.ANTHROPIC_API_KEY
    },
    enabled: false,
    tags: ['ai', 'anthropic', 'claude']
  },
  'huggingface': {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Model inference, dataset access, and transformers pipeline',
    endpoint: 'stdio://hf-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.HUGGINGFACE_API_KEY
    },
    enabled: false,
    tags: ['ai', 'huggingface', 'models', 'datasets']
  },
  'replicate': {
    id: 'replicate',
    name: 'Replicate',
    description: 'AI model hosting and inference for image generation, video processing, and more',
    endpoint: 'stdio://replicate-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.REPLICATE_API_TOKEN
    },
    enabled: false,
    tags: ['ai', 'replicate', 'models', 'inference']
  },
  'slack': {
    id: 'slack',
    name: 'Slack',
    description: 'Channel management, message sending, and bot interactions',
    endpoint: 'stdio://slack-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.SLACK_BOT_TOKEN
    },
    enabled: false,
    tags: ['communication', 'slack', 'messaging']
  },
  'discord': {
    id: 'discord',
    name: 'Discord',
    description: 'Server management, webhook integration, and bot operations',
    endpoint: 'stdio://discord-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.DISCORD_BOT_TOKEN
    },
    enabled: false,
    tags: ['communication', 'discord', 'gaming']
  },
  'email': {
    id: 'email',
    name: 'Email',
    description: 'SMTP email sending, transactional emails, and template management',
    endpoint: 'stdio://email-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['communication', 'email', 'smtp']
  },
  'twilio': {
    id: 'twilio',
    name: 'Twilio',
    description: 'SMS, voice calls, and communication APIs',
    endpoint: 'stdio://twilio-mcp',
    transport: 'stdio',
    auth: {
      type: 'basic',
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN
    },
    enabled: false,
    tags: ['communication', 'sms', 'voice', 'twilio']
  },
  's3': {
    id: 's3',
    name: 'Amazon S3',
    description: 'Bucket operations, file uploads, and CDN integration',
    endpoint: 'stdio://s3-mcp',
    transport: 'stdio',
    auth: {
      type: 'api-key',
      apiKey: process.env.AWS_ACCESS_KEY_ID
    },
    enabled: false,
    tags: ['storage', 's3', 'aws', 'cdn']
  },
  'cloudinary': {
    id: 'cloudinary',
    name: 'Cloudinary',
    description: 'Image and video optimization, transformations, and delivery',
    endpoint: 'stdio://cloudinary-mcp',
    transport: 'stdio',
    auth: {
      type: 'api-key',
      apiKey: process.env.CLOUDINARY_API_KEY
    },
    enabled: false,
    tags: ['media', 'images', 'video', 'optimization']
  },
  'stripe': {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment processing, subscription management, and billing',
    endpoint: 'stdio://stripe-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.STRIPE_SECRET_KEY
    },
    enabled: false,
    tags: ['payments', 'stripe', 'billing', 'subscriptions']
  },
  'analytics': {
    id: 'analytics',
    name: 'Google Analytics',
    description: 'Website analytics, tracking setup, and reporting',
    endpoint: 'stdio://analytics-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['analytics', 'google', 'tracking', 'metrics']
  },
  'contentful': {
    id: 'contentful',
    name: 'Contentful',
    description: 'Headless CMS content management and delivery',
    endpoint: 'stdio://contentful-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.CONTENTFUL_ACCESS_TOKEN
    },
    enabled: false,
    tags: ['cms', 'contentful', 'content', 'headless']
  },
  'sanity': {
    id: 'sanity',
    name: 'Sanity',
    description: 'Sanity CMS content operations and GROQ queries',
    endpoint: 'stdio://sanity-mcp',
    transport: 'stdio',
    auth: {
      type: 'bearer',
      token: process.env.SANITY_API_TOKEN
    },
    enabled: false,
    tags: ['cms', 'sanity', 'content', 'groq']
  },
  'filesystem-advanced': {
    id: 'filesystem-advanced',
    name: 'Advanced Filesystem',
    description: 'File compression, binary handling, and advanced file operations',
    endpoint: 'stdio://filesystem-advanced-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['filesystem', 'compression', 'binary']
  },
  'git-advanced': {
    id: 'git-advanced',
    name: 'Advanced Git',
    description: 'Branch management, merge strategies, and repository analytics',
    endpoint: 'stdio://git-advanced-mcp',
    transport: 'stdio',
    enabled: false,
    tags: ['git', 'version-control', 'branches', 'analytics']
  }
}

// Get servers by tag
export function getServersByTag(tag: string): MCPServerConfig[] {
  return Object.values(MCP_SERVER_REGISTRY).filter(server => 
    server.tags.includes(tag)
  )
}

// Get popular/recommended servers
export function getRecommendedServers(): MCPServerConfig[] {
  const recommended = [
    'supabase-local',
    'postgresql', 
    'docker',
    'openai',
    'slack',
    'email',
    's3',
    'stripe'
  ]
  
  return recommended.map(id => MCP_SERVER_REGISTRY[id]).filter(Boolean)
}

// Server categories for UI organization
export const MCP_SERVER_CATEGORIES = {
  'Database': ['supabase-local', 'supabase-cloud', 'postgresql', 'firebase'],
  'AI/ML': ['openai', 'anthropic', 'huggingface', 'replicate'],
  'Communication': ['slack', 'discord', 'email', 'twilio'],
  'Storage': ['s3', 'cloudinary'],
  'DevOps': ['docker', 'kubernetes', 'aws'],
  'CMS': ['contentful', 'sanity'],
  'Analytics': ['analytics'],
  'Payments': ['stripe'],
  'Development': ['filesystem-advanced', 'git-advanced']
} as const