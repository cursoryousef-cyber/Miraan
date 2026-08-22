import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { roleIdentity } from '../ui/roles';

/**
 * Role-scoped navigation.
 *
 * The item list, its grouping and the accent colour all come from the role
 * identity, so each role sees a differently structured rail rather than one
 * shared menu with items hidden.
 */
export const SidebarContent: React.FC<{ onItemClick?: () => void }> = ({ onItemClick }) => {
  const { user, primaryRole, hasAnyCapability } = useAuth();
  const identity = roleIdentity(primaryRole);
  const RoleIcon = identity.icon;

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
      width: '100%',
      backgroundColor: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '16px 12px',
      overflowY: 'auto',
      boxSizing: 'border-box',
    }}>
      {/* Brand */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 6px 14px 6px', borderBottom: '1px solid #F1F5F9',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: `linear-gradient(135deg, ${identity.accent} 0%, ${identity.accent}CC 100%)`,
          display: 'grid', placeItems: 'center',
          boxShadow: `0 3px 10px ${identity.accent}33`,
        }}>
          <span style={{ fontWeight: 900, fontSize: 18, color: '#fff' }}>مِ</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 15.5, fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>
            مِران (Miran)
          </h1>
          <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>
            منصة التدريب الصحي الوطنية
          </span>
        </div>
      </div>

      {/* Role identity — accent, label and remit */}
      <div style={{
        margin: '12px 2px 6px 2px', padding: '10px 12px',
        backgroundColor: identity.accentSoft, borderRadius: 10,
        border: `1px solid ${identity.accent}26`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <RoleIcon size={14} color={identity.accent} />
          <span style={{ fontSize: 12.5, color: identity.accent, fontWeight: 800 }}>{identity.label}</span>
        </div>
        <div style={{ fontSize: 10, color: '#64748B', lineHeight: 1.4 }}>{identity.tagline}</div>
        {user?.activeOrganization?.nameAr && (
          <div style={{
            fontSize: 10.5, color: '#475569', marginTop: 4, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user.activeOrganization.nameAr}
          </div>
        )}
      </div>

      {/* Grouped navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, flex: 1 }}>
        {sections.map((section) => (
          <div key={section.title} style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 9.5, fontWeight: 800, color: '#94A3B8',
              letterSpacing: '0.5px', padding: '0 10px 4px',
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
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8, marginBottom: 2,
                    color: isActive ? identity.accent : '#475569',
                    backgroundColor: isActive ? identity.accentSoft : 'transparent',
                    border: `1px solid ${isActive ? `${identity.accent}33` : 'transparent'}`,
                    textDecoration: 'none', fontSize: 12.5, lineHeight: 1.35,
                    fontWeight: isActive ? 700 : 600,
                    transition: 'all 0.15s ease',
                  })}
                >
                  {({ isActive }: any) => (
                    <>
                      <Icon size={16} style={{ color: isActive ? identity.accent : '#94A3B8', flexShrink: 0 }} />
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
