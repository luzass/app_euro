import { AuthProvider } from './hooks/useAuth'
import { ProfileProvider } from './hooks/useProfile'
import { AppRoutes } from './routes/AppRoutes'

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <AppRoutes />
      </ProfileProvider>
    </AuthProvider>
  )
}

export default App
