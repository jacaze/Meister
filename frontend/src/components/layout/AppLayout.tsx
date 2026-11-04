import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import QuickTransactionModal from '../modals/QuickTransactionModal.js';

export const AppLayout: React.FC = () => {
  const { user, workspace, activeEntityId, setActiveEntityId, logout } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', path: '/', icon: 'grid_view' },
    { label: 'Lançamentos', path: '/transacoes', icon: 'receipt_long' },
    { label: 'Extratos & Revisão', path: '/revisao', icon: 'inbox' },
    { label: 'Potes Financeiros', path: '/potes', icon: 'savings' },
    { label: 'Insights & Dicas', path: '/insights', icon: 'lightbulb' },
    { label: 'Educação & Lições', path: '/educacao', icon: 'school' },
    ...(user?.accountType === 'mei' ? [{ label: 'Impostos & DAS', path: '/impostos', icon: 'account_balance' }] : []),
    { label: 'Relatórios', path: '/relatorios', icon: 'analytics' },
    { label: 'Perfil & MEI', path: '/perfil', icon: 'storefront' },
  ];

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex flex-col md:flex-row pb-24 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-[#1c1b1b] border-r border-[#ffffff0d] p-6 justify-between shrink-0">
        <div className="space-y-8">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f2c94c] to-[#ffe8ad] flex items-center justify-center text-[#131313] font-bold text-xl shadow-[0_0_20px_rgba(242,201,76,0.25)]">
              M
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white block">MEIster</span>
              <span className="text-[10px] font-bold tracking-widest text-[#f2c94c] uppercase">Luminous Finance</span>
            </div>
          </div>

          {/* Entity Selector (Multi-Entidade PF / PJ) */}
          {workspace && workspace.entities.length > 1 && (
            <div className="bg-[#201f1f] border border-[#ffffff0d] rounded-2xl p-2">
              <label className="text-[10px] font-bold text-[#99907b] uppercase tracking-wider block px-2 mb-1">
                Visão Atual
              </label>
              <select
                className="w-full bg-[#131313] text-sm text-[#e5e2e1] font-semibold rounded-xl px-3 py-2 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c] transition"
                value={activeEntityId || ''}
                onChange={(e) => setActiveEntityId(e.target.value || undefined)}
              >
                {workspace.entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.kind === 'pj' ? '🏢 PJ — ' : '👤 PF — '}
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-[#2a2a2a] text-[#f2c94c] shadow-[0_0_15px_rgba(242,201,76,0.15)] font-bold'
                      : 'text-[#d0c5af] hover:bg-[#201f1f] hover:text-white'
                  }`
                }
              >
                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="border-t border-[#ffffff0d] pt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#2a2a2a] border border-[#ffffff1a] flex items-center justify-center font-bold text-sm text-[#f2c94c]">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[11px] text-[#99907b] truncate capitalize">
                {user?.accountType === 'mei' ? 'MEI / Empresa' : 'Pessoa Física'}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="p-2 text-[#99907b] hover:text-[#ffb4ab] hover:bg-[#2a2a2a] rounded-xl transition"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-[#1c1b1b] border-b border-[#ffffff0d] sticky top-0 z-30 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f2c94c] to-[#ffe8ad] flex items-center justify-center text-[#131313] font-bold text-base">
              M
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">MEIster</span>
          </div>

          {/* Mobile Entity Switcher */}
          {workspace && workspace.entities.length > 1 && (
            <select
              className="bg-[#201f1f] text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-[#ffffff0d] text-[#e5e2e1] focus:outline-none"
              value={activeEntityId || ''}
              onChange={(e) => setActiveEntityId(e.target.value || undefined)}
            >
              {workspace.entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.kind === 'pj' ? 'PJ' : 'PF'} — {ent.name}
                </option>
              ))}
            </select>
          )}

          <button onClick={logout} className="p-1.5 text-[#99907b] hover:text-[#ffb4ab]">
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
        </header>

        {/* Dynamic Page Outlet */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1c1b1b]/95 backdrop-blur-xl border-t border-[#ffffff0d] px-2 py-2 flex items-center gap-1 overflow-x-auto scrollbar-none justify-between sm:justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[10px] font-semibold whitespace-nowrap shrink-0 transition ${
                isActive ? 'text-[#f2c94c]' : 'text-[#99907b]'
              }`
            }
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Floating Action Button (+) */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-20 md:bottom-8 right-6 z-40 w-14 h-14 rounded-full bg-[#f2c94c] text-[#131313] flex items-center justify-center shadow-[0_0_25px_rgba(242,201,76,0.4)] hover:scale-105 active:scale-95 transition-all duration-200"
        title="Novo Lançamento"
      >
        <span className="material-symbols-outlined text-3xl font-bold">add</span>
      </button>

      {/* Modal Lançamento Rápido */}
      {isModalOpen && <QuickTransactionModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

export default AppLayout;
