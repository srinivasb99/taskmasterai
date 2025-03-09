import React from "react"
import { Sidebar } from "./Sidebar"
import { auth } from '../lib/firebase'
import { User, onAuthStateChanged } from 'firebase/auth'
import { updateUserProfile, signOutUser, deleteUserAccount, AuthError, getCurrentUser } from '../lib/settings-firebase';

interface PageLayoutProps {
  children: React.ReactNode
  isBlackoutEnabled?: boolean
  isIlluminateEnabled?: boolean
}

export function PageLayout({ children, isBlackoutEnabled = false, isIlluminateEnabled = false }: PageLayoutProps) {
  const { user } = useAuth()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false)

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  return (
    <div className="flex min-h-screen bg-gray-900">
      <Sidebar
        userName={user?.displayName || "User"}
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        isBlackoutEnabled={isBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled}
      />

      <main
        className={`flex-1 transition-all duration-300 ease-in-out
        ${isSidebarCollapsed ? "md:ml-20" : "md:ml-64"}
        ml-0 pt-14`}
      >
        <div className="px-4 md:px-8 py-4 md:py-6">{children}</div>
      </main>
    </div>
  )
}

