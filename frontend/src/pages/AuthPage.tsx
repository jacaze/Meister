import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export const AuthPage: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<'mei' | 'pessoa_fisica'>('mei');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setError('Por favor, informe seu nome completo.');
          setLoading(false);
          return;
        }
        await register(name.trim(), email.trim(), password, accountType);
      } else {
        await login(email.trim(), password);
      }
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Falha na autenticação. Verifique suas credenciais.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center p-4">
      {/* Background radial glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#f2c94c]/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md bg-[#1c1b1b] border border-[#ffffff14] rounded-3xl p-8 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#f2c94c] to-[#ffe8ad] flex items-center justify-center text-[#131313] font-black text-2xl mx-auto mb-3 shadow-[0_0_30px_rgba(242,201,76,0.3)]">
            M
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">MEIster</h1>
          <p className="text-xs font-semibold text-[#99907b] uppercase tracking-widest mt-1">
            Gestão Financeira para o MEI Real
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-[#131313] rounded-2xl border border-[#ffffff0d] mb-6">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(null); }}
            className={`py-2.5 rounded-xl text-xs font-bold transition ${
              !isRegister
                ? 'bg-[#2a2a2a] text-[#f2c94c] shadow-[0_0_15px_rgba(242,201,76,0.15)]'
                : 'text-[#99907b] hover:text-white'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(null); }}
            className={`py-2.5 rounded-xl text-xs font-bold transition ${
              isRegister
                ? 'bg-[#2a2a2a] text-[#f2c94c] shadow-[0_0_15px_rgba(242,201,76,0.15)]'
                : 'text-[#99907b] hover:text-white'
            }`}
          >
            Criar Conta
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-[#93000a]/30 border border-[#ffb4ab]/40 text-[#ffb4ab] text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
                Nome Completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Carlos Silva"
                className="w-full px-4 py-3 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-[#f2c94c] transition"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-4 py-3 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-[#f2c94c] transition"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-[#f2c94c] transition"
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-2">
                Tipo de Negócio / Perfil
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccountType('mei')}
                  className={`p-3 rounded-2xl border text-left transition ${
                    accountType === 'mei'
                      ? 'bg-[#2a2a2a] border-[#f2c94c] text-white shadow-[0_0_15px_rgba(242,201,76,0.15)]'
                      : 'bg-[#131313] border-[#ffffff0d] text-[#99907b]'
                  }`}
                >
                  <span className="block font-bold text-xs text-white">Sou MEI</span>
                  <span className="text-[10px] text-[#99907b]">Empresa + Pessoal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('pessoa_fisica')}
                  className={`p-3 rounded-2xl border text-left transition ${
                    accountType === 'pessoa_fisica'
                      ? 'bg-[#2a2a2a] border-[#f2c94c] text-white shadow-[0_0_15px_rgba(242,201,76,0.15)]'
                      : 'bg-[#131313] border-[#ffffff0d] text-[#99907b]'
                  }`}
                >
                  <span className="block font-bold text-xs text-white">Pessoa Física</span>
                  <span className="text-[10px] text-[#99907b]">Controle Pessoal</span>
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 bg-[#f2c94c] text-[#131313] text-sm font-extrabold rounded-2xl shadow-[0_0_25px_rgba(242,201,76,0.3)] hover:scale-[1.01] active:scale-[0.99] transition disabled:opacity-50"
          >
            {loading ? 'Processando...' : isRegister ? 'Criar Minha Conta Grátis' : 'Acessar Meu Painel'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AuthPage;
