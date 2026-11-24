import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../api/auth';
import { NAV_ITEMS } from './navigation';
import { PlannedBadge } from './PlannedBadge';

export function AppShell() {
  const { me, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            q
          </span>
          <div>
            <div className="brand-name">quillsync</div>
            <div className="brand-org">{me?.organization.name}</div>
          </div>
        </div>
        <nav>
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <span>{item.label}</span>
                  {item.status === 'planned' && <PlannedBadge ticket={item.ticket} />}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <div className="who">
            <strong>{me?.user.displayName}</strong>
            <span className="role">{me?.role}</span>
          </div>
          <button type="button" className="button ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
