export const weeklyOwnerEmail = 'lucasctdebritto@gmail.com'
export const canAccessWeekly = (email?: string | null) => email?.trim().toLowerCase() === weeklyOwnerEmail
