import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Gear, Paperclip, PaperPlaneRight, X } from '../ui/icons.js';
import api from '../../api/client.js';
import Mel from '../brand/Mel.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

interface ProposalData {
  id: string;
  type: 'receita' | 'despesa';
  amount: string;
  description: string;
  date: string;
  categoryId: string | null;
  categoryName: string;
  paymentMethod: string | null;
  scope: 'pj' | 'pf';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind?: 'proposal' | 'question' | 'finance_query' | 'education' | 'general' | 'receipt';
  proposal?: ProposalData;
  proposalStatus?: 'pending' | 'confirmed' | 'cancelled';
  timestamp: string;
  isAiGenerated?: boolean;
}

interface AssistantConfig {
  hasApiKey: boolean;
  model: string;
}

export const FloatingAssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<AssistantConfig>({
    hasApiKey: false,
    model: 'gemini-3.5-flash',
  });

  // Settings status
  const [selectedModel, setSelectedModel] = useState('gemini-3.5-flash');

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        `🐝 **Oi! Eu sou a Mel, sua abelha das finanças.**\n\n` +
        `Eu organizo o seu dinheiro como um favo de mel. Pode me pedir para:\n` +
        `• **Lançar:** *"Gastei 45 no almoço"* ou *"Recebi 350 via Pix"*\n` +
        `• **Consultar:** *"Qual meu saldo?"* ou *"Como estão meus potes?"*\n` +
        `• **Tirar dúvidas:** *"Qual o teto do MEI?"* ou *"Quando vence o DAS?"*\n` +
        `• **Escanear recibo:** Envie a foto de uma nota ou comprovante no botão 📎 abaixo!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // Botão da Mel some ao rolar para baixo (não cobre conteúdo) e volta ao rolar para cima.
  const [fabHidden, setFabHidden] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) > 8) setFabHidden(y > last && y > 80);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // O "oi" da Mel aparece uma vez por sessão.
    let greeted = false;
    try {
      greeted = sessionStorage.getItem('mel_greeted') === '1';
      sessionStorage.setItem('mel_greeted', '1');
    } catch {
      greeted = false;
    }
    const show = window.setTimeout(() => !greeted && setShowGreeting(true), 1800);
    const hide = window.setTimeout(() => setShowGreeting(false), 6500);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);
  const melMood = loading || uploadingReceipt ? 'thinking' : 'idle';

  // Load config on mount
  const fetchConfig = async () => {
    try {
      const res = await api.get('/assistant/config');
      setConfig(res.data);
      if (res.data.model) setSelectedModel(res.data.model);
    } catch (err) {
      console.warn('Erro ao carregar status do assistente:', err);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);



  // Handle Send Message
  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputText).trim();
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');
    setLoading(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.post('/assistant/chat', {
        message: textToSend,
        history: historyPayload,
      });

      const data = res.data;
      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        kind: data.kind,
        proposal: data.proposal
          ? {
              ...data.proposal,
              id: data.proposal.id,
            }
          : undefined,
        proposalStatus: data.proposal ? 'pending' : undefined,
        isAiGenerated: data.isAiGenerated,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content:
          err.response?.data?.message ||
          'Desculpe, ocorreu um erro temporário ao processar sua mensagem. Tente novamente.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Handle Confirm Proposal
  const handleConfirmProposal = async (msgId: string, proposalId: string) => {
    try {
      await api.post(`/assistant/proposals/${proposalId}/confirm`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                proposalStatus: 'confirmed',
                content: `${m.content}\n\n✅ **Lançamento registrado com sucesso no livro-caixa!**`,
              }
            : m
        )
      );
      haptic([12, 40, 12]);
      celebrate('small');
      window.dispatchEvent(new CustomEvent('transaction-saved'));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao confirmar lançamento.');
    }
  };

  // Handle Cancel Proposal
  const handleCancelProposal = async (msgId: string, proposalId: string) => {
    try {
      await api.post(`/assistant/proposals/${proposalId}/cancel`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                proposalStatus: 'cancelled',
                content: `${m.content}\n\n❌ **Lançamento cancelado.**`,
              }
            : m
        )
      );
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao cancelar proposta.');
    }
  };

  // Handle Receipt Upload
  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReceipt(true);

    const userUploadMsg: ChatMessage = {
      id: `usr_up_${Date.now()}`,
      role: 'user',
      content: `📷 Envio de comprovante fiscal: *${file.name}*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userUploadMsg]);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const res = await api.post('/assistant/receipt', {
          imageBase64: base64Data,
          mimeType: file.type || 'image/jpeg',
        });

        const receipt = res.data;
        const total = receipt.total || '0.00';
        const issuer = receipt.issuerName || receipt.issuerCnpj || 'Estabelecimento';
        const itemsCount = receipt.items?.length || 0;

        let content = `🧾 **Comprovante lido com sucesso!**\n\n`;
        content += `• **Estabelecimento:** ${issuer}\n`;
        content += `• **Data:** ${receipt.issuedOn}\n`;
        content += `• **Valor Total:** R$ ${total.replace('.', ',')}\n`;
        if (itemsCount > 0) {
          content += `• **Itens identificados:** ${itemsCount}\n`;
        }

        // Check if there is an automatic proposal
        const asstMsg: ChatMessage = {
          id: `asst_rcpt_${Date.now()}`,
          role: 'assistant',
          content,
          kind: 'receipt',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, asstMsg]);

        // Auto trigger text proposal for the total amount
        if (parseFloat(total) > 0) {
          handleSendMessage(`Gastei ${total} em ${issuer}`);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content:
              err.response?.data?.message ||
              'Não foi possível extrair os dados do comprovante. Verifique a iluminação da foto ou insira manualmente.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      } finally {
        setUploadingReceipt(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const renderFormatted = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lIdx) => {
      const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
      return (
        <div key={lIdx} className="min-h-[1.25rem]">
          {parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="text-ink font-bold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith('*') && part.endsWith('*')) {
              return (
                <em key={pIdx} className="italic text-ink-soft">
                  {part.slice(1, -1)}
                </em>
              );
            }
            return <span key={pIdx}>{part}</span>;
          })}
        </div>
      );
    });
  };

  return (
    <>
      {/* Botão da Mel (assistente) */}
      <AnimatePresence>
        {!isOpen && !fabHidden && (
          <motion.div
            className="fixed right-4 z-40 bottom-[calc(96px+env(safe-area-inset-bottom))] md:bottom-8 md:right-8 flex items-end gap-2"
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 20 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          >
            <AnimatePresence>
              {showGreeting && (
                <motion.button
                  onClick={() => setIsOpen(true)}
                  initial={{ opacity: 0, x: 12, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 8, scale: 0.9 }}
                  className="mb-3 max-w-[180px] rounded-2xl rounded-br-md bg-card px-3.5 py-2.5 text-left text-sm font-semibold text-ink shadow-[var(--shadow-float)] ring-1 ring-ink/5"
                >
                  Oi! Posso anotar um gasto pra você? 🍯
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button
              onClick={() => {
                haptic(10);
                setShowGreeting(false);
                setIsOpen(true);
              }}
              whileHover={reduceMotion ? undefined : { scale: 1.06, rotate: -4 }}
              whileTap={{ scale: 0.9 }}
              aria-label="Abrir assistente Mel"
              className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-primary-soft to-primary shadow-[var(--shadow-honey)] ring-4 ring-card"
            >
              <Mel size={52} mood={showGreeting ? 'wave' : 'idle'} />
              <span
                className={`absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-card ${
                  config.hasApiKey ? 'bg-success' : 'bg-primary-deep'
                }`}
                title={config.hasApiKey ? 'IA Gemini ativa' : 'Modo local'}
              />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Painel do chat: tela cheia no celular, janela flutuante no desktop */}
      <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-label="Assistente Mel"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          className="fixed inset-0 z-[55] flex flex-col overflow-hidden bg-card pt-safe pb-safe md:inset-auto md:bottom-8 md:right-8 md:h-[640px] md:max-h-[calc(100dvh-64px)] md:w-[420px] md:rounded-[28px] md:pt-0 md:pb-0 md:shadow-[var(--shadow-float)] md:ring-1 md:ring-ink/5"
        >
          {/* Cabeçalho */}
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-ink/5 bg-gradient-to-b from-primary-soft/70 to-card px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-card ring-2 ring-primary/50">
                <Mel size={42} mood={melMood} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-ink">Mel</h3>
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      config.hasApiKey ? 'bg-success/10 text-success' : 'bg-primary/20 text-brand'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${config.hasApiKey ? 'bg-success animate-pulse' : 'bg-primary-deep'}`} />
                    {config.hasApiKey ? 'IA ativa' : 'Modo local'}
                  </span>
                </div>
                <p className="truncate text-xs text-muted">
                  {loading || uploadingReceipt ? 'pensando…' : 'sua abelha das finanças'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowConfig((prev) => !prev)}
                aria-label="Status da IA"
                className={`grid h-10 w-10 place-items-center rounded-full transition ${
                  showConfig ? 'bg-primary text-on-primary' : 'text-muted hover:bg-field hover:text-ink'
                }`}
              >
                <Gear size={20} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Fechar assistente"
                className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-field hover:text-ink"
              >
                <X size={20} weight="bold" />
              </button>
            </div>
          </div>

          {/* Gemini Config Sub-Panel */}
          {showConfig ? (
            <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-card border-b border-ink/5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                  <span className="material-symbols-outlined text-brand text-lg">key</span>
                  Conexão Google Gemini API
                </h4>
                <button
                  onClick={() => setShowConfig(false)}
                  className="text-xs text-muted hover:text-ink underline"
                >
                  Voltar ao chat
                </button>
              </div>

              <p className="text-xs text-ink-soft leading-relaxed">
                Adicione sua chave para ativar inteligência artificial generativa em tempo real, visão de cupons fiscais e respostas contextuais personalizadas para o seu MEI.
              </p>

              {/* Status Box */}
              <div className="p-3 rounded-2xl bg-card-2 border border-ink/5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Status atual:</span>
                  <span className={`font-bold ${config.hasApiKey ? 'text-success' : 'text-brand'}`}>
                    {config.hasApiKey ? 'Conectado e Ativo' : 'Não configurado (modo local)'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Modelo:</span>
                  <span className="font-mono text-ink text-[11px]">{config.model}</span>
                </div>
              </div>

              {/* Deployment Info */}
              <div className="text-[11px] text-muted bg-ink/4 p-3 rounded-xl border border-ink/4 space-y-1.5">
                <p className="font-semibold text-ink">Configuração Centralizada:</p>
                <p>
                  As credenciais de Inteligência Artificial do Google Gemini são configuradas exclusivamente nas variáveis de ambiente do deploy da plataforma (<code className="text-ink font-mono">GEMINI_API_KEY</code>).
                </p>
                <p>
                  Usuários e workspaces compartilham o modelo provisionado com segurança, sem necessidade de chaves locais.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-field hover:bg-raised text-ink text-xs font-bold transition"
                >
                  Voltar ao Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      <div
                        className={`max-w-[88%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                          isUser
                            ? 'bg-field text-ink rounded-br-none border border-ink/5'
                            : 'bg-card text-ink rounded-bl-none border border-ink/8 shadow-md'
                        }`}
                      >
                        {renderFormatted(msg.content)}

                        {/* Interactive Proposal Card */}
                        {msg.proposal && (
                          <div className="mt-3 p-3 rounded-xl bg-card-2 border border-primary/40 space-y-2">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                                  msg.proposal.type === 'receita'
                                    ? 'bg-success/20 text-success'
                                    : 'bg-danger/20 text-danger'
                                }`}
                              >
                                {msg.proposal.type === 'receita' ? '▲ Receita' : '▼ Despesa'}
                              </span>
                              <span className="text-[10px] text-muted uppercase font-bold">
                                {msg.proposal.scope === 'pj' ? '🏢 PJ' : '👤 PF'}
                              </span>
                            </div>

                            <div className="flex items-baseline justify-between">
                              <span className="text-base font-extrabold text-ink">
                                R$ {msg.proposal.amount.replace('.', ',')}
                              </span>
                              <span className="text-[11px] text-brand font-semibold truncate max-w-[150px]">
                                {msg.proposal.categoryName}
                              </span>
                            </div>

                            <p className="text-[11px] text-ink-soft">{msg.proposal.description}</p>

                            {/* Buttons */}
                            {msg.proposalStatus === 'pending' && (
                              <div className="flex gap-2 pt-1 border-t border-ink/5">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmProposal(msg.id, msg.proposal!.id)}
                                  className="flex-1 py-1.5 px-2 rounded-lg bg-success hover:bg-success text-ink text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">check</span>
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelProposal(msg.id, msg.proposal!.id)}
                                  className="py-1.5 px-2.5 rounded-lg bg-field hover:bg-raised text-muted hover:text-ink text-[11px] font-semibold transition"
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}

                            {msg.proposalStatus === 'confirmed' && (
                              <div className="pt-1 text-[11px] font-bold text-success flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Lançado no Livro-Caixa
                              </div>
                            )}

                            {msg.proposalStatus === 'cancelled' && (
                              <div className="pt-1 text-[11px] font-semibold text-muted flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">cancel</span>
                                Proposta descartada
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <span className="text-[9px] text-faint px-1">
                        {msg.timestamp}
                        {msg.isAiGenerated && ' • Gerado com Gemini'}
                      </span>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex items-center gap-2 p-3 max-w-[70%] rounded-2xl bg-card border border-ink/8 text-xs text-muted">
                    <span className="material-symbols-outlined text-sm animate-spin text-brand">
                      sync
                    </span>
                    <span>Analisando...</span>
                  </div>
                )}

                {uploadingReceipt && (
                  <div className="flex items-center gap-2 p-3 max-w-[70%] rounded-2xl bg-card border border-ink/8 text-xs text-muted">
                    <span className="material-symbols-outlined text-sm animate-spin text-brand">
                      document_scanner
                    </span>
                    <span>Processando visão de comprovante...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Suggestions */}
              <div className="px-3 py-1.5 bg-card border-t border-ink/4 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                {[
                  'Qual meu saldo?',
                  'Gastei 45 no almoço',
                  'Recebi 350 via Pix',
                  'Como estão os potes?',
                  'Quando vence o DAS?',
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    className="text-[10px] whitespace-nowrap px-2.5 py-1 rounded-lg bg-card-2 hover:bg-field border border-ink/5 text-ink-soft hover:text-ink transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input Area */}
              <div className="p-3 bg-card-2 border-t border-ink/5 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  {/* File Upload Button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleReceiptFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingReceipt || loading}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-field hover:text-brand disabled:opacity-50"
                    aria-label="Enviar foto de nota ou comprovante"
                  >
                    <Paperclip size={22} />
                  </button>

                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Ex.: gastei 45 no almoço"
                    aria-label="Mensagem para a Mel"
                    className="min-w-0 flex-1 rounded-full border border-ink/10 bg-canvas px-4 py-3 text-sm text-ink transition focus:border-primary focus:outline-none"
                  />

                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.88 }}
                    disabled={loading || !inputText.trim()}
                    aria-label="Enviar"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary shadow-[var(--shadow-honey)] transition disabled:opacity-40 disabled:shadow-none"
                  >
                    <PaperPlaneRight size={20} weight="fill" />
                  </motion.button>
                </form>
              </div>
            </>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
};

export default FloatingAssistantWidget;
