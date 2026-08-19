import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { roleIdentity } from '../ui/roles';

/**
 * Role-scoped navigation.
 *
 * The item list, its grouping and the accent colour all come from the role
 * identity, so each role sees a differently structured rail rather than one
 * shared menu with items hidden. Grouping is what turns a flat list of eleven
 * destinations into two or three readable areas of responsibility.
 */
export const SidebarContent: React.FC<{ onItemClick?: () => void }> = ({ onItemClick }) => {
  const { user, primaryRole, hasAnyCapability } = useAuth();
  const identity = roleIdentity(primaryRole);
  const RoleIcon = identity.icon;

  // Items are filtered by capability, and a section whose items all filtered out
  // is dropped rather than left as an empty heading. An item with no declared
  // requirement is always shown.
  const sections = identity.nav
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.requires || item.requires.length === 0 || hasAnyCapability(item.requires),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div style={{
      width: '280px',
      backgroundColor: '#FFFFFF',
      borderLeft: '1px solid #E2E8F0',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '100vh',
      padding: '20px 14px',
      overflowY: 'auto',
    }}>
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 8px 18px 8px', borderBottom: '1px solid #F1F5F9',
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: `linear-gradient(135deg, ${identity.accent} 0%, ${identity.accent}CC 100%)`,
          display: 'grid', placeItems: 'center',
          boxShadow: `0 4px 12px ${identity.accent}33`,
        }}>
          <span style={{ fontWeight: 900, fontSize: 20, color: '#fff' }}>مِ</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>
            مِران (Miran)
          </h1>
          <span style={{ fontSize: 10.5, color: '#64748B', fontWeight: 600 }}>
            منصة التدريب الصحي الوطنية
          </span>
        </div>
      </div>

      {/* Role identity — accent, label and remit make the role obvious at a glance. */}
      <div style={{
        margin: '16px 4px 8px 4px', padding: '12px 14px',
        backgroundColor: identity.accentSoft, borderRadius: 12,
        border: `1px solid ${identity.accent}26`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <RoleIcon size={15} color={identity.accent} />
          <span style={{ fontSize: 13, color: identity.accent, fontWeight: 800 }}>{identity.label}</span>
        </div>
        <div style={{ fontSize: 10.5, color: '#64748B', lineHeight: 1.5 }}>{identity.tagline}</div>
        {user?.activeOrganization?.nameAr && (
          <div style={{
            fontSize: 11, color: '#475569', marginTop: 6, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.activeOrganization.nameAr}
          </div>
        )}
      </div>

      {/* Grouped navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, flex: 1 }}>
        {sections.map((section) => (
          <div key={section.title} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, color: '#94A3B8',
              letterSpacing: '0.7px', padding: '0 14px 6px',
            }}>
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path + item.name}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onItemClick}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '9px 14px', borderRadius: 10, marginBottom: 2,
                    color: isActive ? identity.accent : '#475569',
                    backgroundColor: isActive ? identity.accentSoft : 'transparent',
                    border: `1px solid ${isActive ? `${identity.accent}33` : 'transparent'}`,
                    textDecoration: 'none', fontSize: 13, lineHeight: 1.4,
                    fontWeight: isActive ? 700 : 600,
                    transition: 'all 0.15s ease',
                  })}
                >
                  {({ isActive }: any) => (
                    <>
                      <Icon size={17} style={{ color: isActive ? identity.accent : '#94A3B8', flexShrink: 0 }} />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
};

export const Sidebar: React.FC = () => <SidebarContent />;
