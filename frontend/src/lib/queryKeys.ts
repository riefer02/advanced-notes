export const queryKeys = {
  notes: {
    all: ['notes'] as const,
    list: (folder?: string, limit?: number, offset?: number) =>
      ['notes', folder, limit, offset] as const,
    detail: (noteId: string) => ['note', noteId] as const,
    search: (query: string) => ['search', query] as const,
    byTag: (tag: string | null, limit?: number) => ['notes', 'tag', tag, limit] as const,
  },
  folders: { all: ['folders'] as const },
  tags: { all: ['tags'] as const },
  todos: {
    all: ['todos'] as const,
    list: (params?: object) => ['todos', params] as const,
    detail: (todoId: string) => ['todo', todoId] as const,
    forNote: (noteId: string) => ['noteTodos', noteId] as const,
    forNotePrefix: ['noteTodos'] as const,
  },
  meals: {
    all: ['meals'] as const,
    list: (params: object) => ['meals', params] as const,
    detail: (mealId: string | null, calendarOwner?: string) =>
      ['meal', mealId, calendarOwner] as const,
    calendar: (year: number, month: number, calendarOwner?: string) =>
      ['mealsCalendar', year, month, calendarOwner] as const,
    calendarPrefix: ['mealsCalendar'] as const,
  },
  vinyl: {
    all: ['vinyl'] as const,
    list: (params?: object) => ['vinyl', params] as const,
    detail: (recordId: string | null, owner?: string) => ['vinyl', recordId, owner] as const,
    stats: (owner?: string) => ['vinylStats', owner] as const,
    statsPrefix: ['vinylStats'] as const,
    search: (query: string, owner?: string) => ['vinylSearch', query, owner] as const,
  },
  friends: {
    all: ['friends'] as const,
    requests: ['friendRequests'] as const,
    sent: ['sentRequests'] as const,
  },
  shares: {
    all: ['shares'] as const,
    received: ['receivedShares'] as const,
  },
  profile: {
    me: ['profile'] as const,
    user: (userId: string) => ['profile', userId] as const,
    usernameAvailable: (username: string) => ['username-available', username] as const,
  },
  userSearch: (query: string) => ['userSearch', query] as const,
  settings: ['userSettings'] as const,
  dashboard: ['dashboardStats'] as const,
  digests: (limit?: number, offset?: number) => ['digests', limit, offset] as const,
  digestsPrefix: ['digests'] as const,
  askHistory: (limit?: number, offset?: number) => ['ask-history', limit, offset] as const,
  askHistoryPrefix: ['ask-history'] as const,
  feedback: (params?: object) => ['feedback', params] as const,
  feedbackPrefix: ['feedback'] as const,
} as const
