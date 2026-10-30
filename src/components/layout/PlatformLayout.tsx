import { Outlet, useLocation } from 'react-router-dom'

/**
 * Route shell for everything under /platform.
 *
 * This used to render a second, private header and a forced `dark` wrapper for
 * /platform/applications, which made School Applications look like a different
 * product from the rest of the Operator Control Center. Every platform route —
 * applications included — now renders inside the shared workspace shell, so
 * there is only one header, one sidebar and one theme.
 */
export default function PlatformLayout() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="route-motion route-motion--workspace">
      <Outlet />
    </div>
  )
}
