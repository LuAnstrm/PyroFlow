import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { api, setSessionEndedHandler, type User } from "./lib"
import { JoinShop, Login } from "./Login"
import { Shell } from "./Shell"

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    setSessionEndedHandler(() => setUser(null))
    api<{ user: User | null }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="boot-screen">
        <Loader2 className="spin" size={28} />
      </div>
    )
  }
  if (!user) return <Login onLogin={setUser} />
  const logout = () => {
    api("/auth/logout", { method: "POST" })
      .catch(() => {})
      .finally(() => setUser(null))
  }
  // Signed in, but not part of the shop yet (or the owner removed them).
  if (!user.role) return <JoinShop user={user} onJoined={setUser} onLogout={logout} />
  return (
    <Shell
      user={user}
      setUser={setUser}
      onLoggedOut={() => {
        window.location.hash = ""
        setUser(null)
      }}
    />
  )
}
