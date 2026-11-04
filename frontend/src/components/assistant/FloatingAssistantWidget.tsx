import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/client.js';

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
  maskedKey: string | null;
  model: string;
}

export const FloatingAssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<AssistantConfig>({
    hasApiKey: false,
    maskedKey: null,
    model: 'gemini-1.5-flash',
  });

  // Settings form states
  const [inputKey, setInputKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [configLoading, setConfigLoading] = useState(false);
  const [configStatus, setConfigStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        `👋 **Olá! Sou o MEIster Copilot, seu assistente financeiro inteligente.**\n\n` +
        `Estou aqui para facilitar a gestão do seu MEI. Você pode me pedir para:\n` +
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

  // Handle Save Gemini API Key
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    setConfigStatus(null);

    try {
      const res = await api.post('/assistant/config', {
        apiKey: inputKey.trim() || undefined,
        model: selectedModel,
      });
      setConfig({
        hasApiKey: res.data.hasApiKey,
        maskedKey: res.data.maskedKey || null,
        model: res.data.model || selectedModel,
      });
      setConfigStatus({ type: 'success', message: res.data.message });
      setInputKey('');
      setTimeout(() => setShowConfig(false), 1500);
    } catch (err: any) {
      setConfigStatus({
        type: 'error',
        message: err.response?.data?.message || 'Falha ao validar a chave da Google Gemini API.',
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // Handle Remove Key
  const handleRemoveKey = async () => {
    if (!confirm('Deseja realmente desconectar sua chave Gemini? O assistente voltará ao modo heurístico local.')) {
      return;
    }
    setConfigLoading(true);
    try {
      await api.post('/assistant/config', { apiKey: '' });
      setConfig({ hasApiKey: false, maskedKey: null, model: 'gemini-1.5-flash' });
      setConfigStatus({ type: 'success', message: 'Chave removida. Modo local ativado.' });
      setTimeout(() => setShowConfig(false), 1200);
    } catch (err: any) {
      setConfigStatus({
        type: 'error',
        message: err.response?.data?.message || 'Falha ao remover a chave.',
      });
    } finally {
      setConfigLoading(false);
    }
  };

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
                <strong key={pIdx} className="text-white font-bold">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith('*') && part.endsWith('*')) {
              return (
                <em key={pIdx} className="italic text-[#d0c5af]">
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
      {/* Floating Action Button (Copilot) */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-36 md:bottom-24 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-tr from-[#1f1d18] via-[#2a261f] to-[#3a3220] border-2 border-[#f2c94c] text-[#f2c94c] flex items-center justify-center shadow-[0_0_25px_rgba(242,201,76,0.35)] hover:shadow-[0_0_35px_rgba(242,201,76,0.6)] hover:scale-105 active:scale-95 transition-all duration-200 group"
        title="Assistente MEIster IA"
      >
        <span className="material-symbols-outlined text-2xl group-hover:rotate-12 transition-transform duration-300">
          auto_awesome
        </span>

        {/* Live Status Indicator Dot */}
        <span
          className={`absolute top-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-[#131313] ${
            config.hasApiKey ? 'bg-[#27ae60] shadow-[0_0_8px_#27ae60]' : 'bg-[#f2c94c]'
          }`}
          title={config.hasApiKey ? 'Gemini IA Ativo' : 'Modo Heurístico Local'}
        />
      </button>

      {/* Floating Chat Drawer Window */}
      {isOpen && (
        <div className="fixed bottom-24 md:bottom-24 right-4 md:right-8 z-50 w-[360px] sm:w-[420px] max-w-[calc(100vw-32px)] h-[580px] max-h-[calc(100vh-140px)] rounded-3xl bg-[#1c1b1b] border border-[#ffffff1a] shadow-[0_12px_45px_rgba(0,0,0,0.7)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="p-4 bg-[#201f1f] border-b border-[#ffffff0d] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f2c94c] to-[#ffe8ad] flex items-center justify-center text-[#131313] shadow-[0_0_12px_rgba(242,201,76,0.3)]">
                <span className="material-symbols-outlined text-lg font-bold">auto_awesome</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-white">MEIster Copilot</h3>
                  {config.hasApiKey ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#27ae60]/20 text-[#27ae60] border border-[#27ae60]/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#27ae60] animate-pulse" />
                      Gemini ⚡
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f2c94c]/20 text-[#f2c94c] border border-[#f2c94c]/30">
                      Local 🤖
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#99907b]">Gestão financeira em linguagem natural</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowConfig((prev) => !prev)}
                className={`p-1.5 rounded-xl transition ${
                  showConfig
                    ? 'bg-[#f2c94c] text-[#131313]'
                    : 'text-[#99907b] hover:text-white hover:bg-[#2a2a2a]'
                }`}
                title="Configurar Chave Gemini"
              >
                <span className="material-symbols-outlined text-lg">settings</span>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-[#99907b] hover:text-white hover:bg-[#2a2a2a] rounded-xl transition"
                title="Minimizar"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          </div>

          {/* Gemini Config Sub-Panel */}
          {showConfig ? (
            <div className="p-5 flex-1 overflow-y-auto space-y-4 bg-[#181818] border-b border-[#ffffff0d]">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#f2c94c] text-lg">key</span>
                  Conexão Google Gemini API
                </h4>
                <button
                  onClick={() => setShowConfig(false)}
                  className="text-xs text-[#99907b] hover:text-white underline"
                >
                  Voltar ao chat
                </button>
              </div>

              <p className="text-xs text-[#d0c5af] leading-relaxed">
                Adicione sua chave para ativar inteligência artificial generativa em tempo real, visão de cupons fiscais e respostas contextuais personalizadas para o seu MEI.
              </p>

              {/* Status Box */}
              <div className="p-3 rounded-2xl bg-[#201f1f] border border-[#ffffff0d] text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#99907b]">Status atual:</span>
                  <span className={`font-bold ${config.hasApiKey ? 'text-[#27ae60]' : 'text-[#f2c94c]'}`}>
                    {config.hasApiKey ? 'Conectado e Ativo' : 'Não configurado (modo local)'}
                  </span>
                </div>
                {config.maskedKey && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#99907b]">Chave ativa:</span>
                    <span className="font-mono text-white text-[11px]">{config.maskedKey}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[#99907b]">Modelo:</span>
                  <span className="font-mono text-white text-[11px]">{config.model}</span>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSaveConfig} className="space-y-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-[#99907b] uppercase block mb-1">
                    Chave de API do Gemini (AIzaSy...)
                  </label>
                  <input
                    type="password"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder={config.hasApiKey ? 'Substituir chave...' : 'Cole aqui sua chave AIza...'}
                    className="w-full px-3.5 py-2.5 bg-[#131313] border border-[#ffffff14] rounded-xl text-xs text-white focus:outline-none focus:border-[#f2c94c] transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#99907b] uppercase block mb-1">
                    Modelo Gemini
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#131313] border border-[#ffffff14] rounded-xl text-xs text-white focus:outline-none focus:border-[#f2c94c] transition"
                  >
                    <option value="gemini-1.5-flash">gemini-1.5-flash (Recomendado, Rápido e Gratuito)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash (Nova Geração)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (Raciocínio Profundo)</option>
                  </select>
                </div>

                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#f2c94c] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    Obter chave gratuita no Google AI Studio
                  </a>
                </div>

                {configStatus && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-medium ${
                      configStatus.type === 'success'
                        ? 'bg-[#27ae60]/15 text-[#27ae60] border border-[#27ae60]/30'
                        : 'bg-[#eb5757]/15 text-[#eb5757] border border-[#eb5757]/30'
                    }`}
                  >
                    {configStatus.message}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={configLoading || !inputKey.trim()}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#f2c94c] text-[#131313] text-xs font-bold shadow-[0_0_15px_rgba(242,201,76,0.3)] hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50"
                  >
                    {configLoading ? 'Validando...' : 'Salvar e Validar'}
                  </button>

                  {config.hasApiKey && (
                    <button
                      type="button"
                      onClick={handleRemoveKey}
                      disabled={configLoading}
                      className="py-2.5 px-3 rounded-xl bg-[#eb5757]/15 text-[#eb5757] border border-[#eb5757]/30 text-xs font-bold hover:bg-[#eb5757]/25 transition"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </form>
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
                            ? 'bg-[#2a2a2a] text-white rounded-br-none border border-[#ffffff0d]'
                            : 'bg-[#151515] text-[#e5e2e1] rounded-bl-none border border-[#ffffff14] shadow-md'
                        }`}
                      >
                        {renderFormatted(msg.content)}

                        {/* Interactive Proposal Card */}
                        {msg.proposal && (
                          <div className="mt-3 p-3 rounded-xl bg-[#201f1f] border border-[#f2c94c]/40 space-y-2">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                                  msg.proposal.type === 'receita'
                                    ? 'bg-[#27ae60]/20 text-[#27ae60]'
                                    : 'bg-[#eb5757]/20 text-[#eb5757]'
                                }`}
                              >
                                {msg.proposal.type === 'receita' ? '▲ Receita' : '▼ Despesa'}
                              </span>
                              <span className="text-[10px] text-[#99907b] uppercase font-bold">
                                {msg.proposal.scope === 'pj' ? '🏢 PJ' : '👤 PF'}
                              </span>
                            </div>

                            <div className="flex items-baseline justify-between">
                              <span className="text-base font-extrabold text-white">
                                R$ {msg.proposal.amount.replace('.', ',')}
                              </span>
                              <span className="text-[11px] text-[#f2c94c] font-semibold truncate max-w-[150px]">
                                {msg.proposal.categoryName}
                              </span>
                            </div>

                            <p className="text-[11px] text-[#d0c5af]">{msg.proposal.description}</p>

                            {/* Buttons */}
                            {msg.proposalStatus === 'pending' && (
                              <div className="flex gap-2 pt-1 border-t border-[#ffffff0d]">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmProposal(msg.id, msg.proposal!.id)}
                                  className="flex-1 py-1.5 px-2 rounded-lg bg-[#27ae60] hover:bg-[#219653] text-white text-[11px] font-bold transition flex items-center justify-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">check</span>
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelProposal(msg.id, msg.proposal!.id)}
                                  className="py-1.5 px-2.5 rounded-lg bg-[#2a2a2a] hover:bg-[#333] text-[#99907b] hover:text-white text-[11px] font-semibold transition"
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}

                            {msg.proposalStatus === 'confirmed' && (
                              <div className="pt-1 text-[11px] font-bold text-[#27ae60] flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Lançado no Livro-Caixa
                              </div>
                            )}

                            {msg.proposalStatus === 'cancelled' && (
                              <div className="pt-1 text-[11px] font-semibold text-[#99907b] flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">cancel</span>
                                Proposta descartada
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <span className="text-[9px] text-[#706c64] px-1">
                        {msg.timestamp}
                        {msg.isAiGenerated && ' • Gerado com Gemini'}
                      </span>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex items-center gap-2 p-3 max-w-[70%] rounded-2xl bg-[#151515] border border-[#ffffff14] text-xs text-[#99907b]">
                    <span className="material-symbols-outlined text-sm animate-spin text-[#f2c94c]">
                      sync
                    </span>
                    <span>Analisando...</span>
                  </div>
                )}

                {uploadingReceipt && (
                  <div className="flex items-center gap-2 p-3 max-w-[70%] rounded-2xl bg-[#151515] border border-[#ffffff14] text-xs text-[#99907b]">
                    <span className="material-symbols-outlined text-sm animate-spin text-[#f2c94c]">
                      document_scanner
                    </span>
                    <span>Processando visão de comprovante...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Suggestions */}
              <div className="px-3 py-1.5 bg-[#171717] border-t border-[#ffffff08] flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
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
                    className="text-[10px] whitespace-nowrap px-2.5 py-1 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#ffffff0d] text-[#d0c5af] hover:text-white transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input Area */}
              <div className="p-3 bg-[#201f1f] border-t border-[#ffffff0d] shrink-0">
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
                    className="p-2.5 rounded-xl text-[#99907b] hover:text-[#f2c94c] hover:bg-[#2a2a2a] transition disabled:opacity-50"
                    title="Escanear Comprovante / Foto"
                  >
                    <span className="material-symbols-outlined text-lg">attach_file</span>
                  </button>

                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Digite um gasto, ganho ou dúvida..."
                    className="flex-1 px-3.5 py-2.5 bg-[#131313] border border-[#ffffff14] rounded-xl text-xs text-white focus:outline-none focus:border-[#f2c94c] transition"
                  />

                  <button
                    type="submit"
                    disabled={loading || !inputText.trim()}
                    className="p-2.5 rounded-xl bg-[#f2c94c] text-[#131313] hover:scale-105 active:scale-95 transition disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center"
                    title="Enviar"
                  >
                    <span className="material-symbols-outlined text-lg font-bold">send</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default FloatingAssistantWidget;
